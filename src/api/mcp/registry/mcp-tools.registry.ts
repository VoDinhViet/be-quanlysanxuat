import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  RequestMethod,
  type Type,
} from '@nestjs/common';
import {
  EXCEPTION_FILTERS_METADATA,
  GUARDS_METADATA,
  INTERCEPTORS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
  PIPES_METADATA,
} from '@nestjs/common/constants';
import { ConfigService } from '@nestjs/config';
import { DiscoveryService, MetadataScanner } from '@nestjs/core';
import { z } from 'zod';

import { AllConfigType } from '../../../config/config.type';
import type { PermissionCode } from '../../../constants/permission.constant';
import { IS_PUBLIC_KEY } from '../../../decorators/public.decorator';
import { PERMISSIONS_KEY } from '../../../decorators/permissions.decorator';
import { MCP_CATALOG } from '../catalog';
import type { McpCatalogEntry } from '../catalog/define-mcp-tool';
import {
  MCP_EXCLUDED_ROUTES,
  type McpRouteInfo,
} from '../catalog/excluded-routes';
import {
  MCP_DOMAINS,
  MCP_MAX_PAGE_LIMIT,
  MCP_TOOL_ACTIONS,
  MCP_TOOL_NAME_MAX_LENGTH,
  MCP_TOOL_NAME_PATTERN,
  type McpDomain,
} from '../mcp.constant';
import type { McpCaller } from '../types/mcp-caller.type';
import { buildDtoShape } from './dto-zod-schema';
import { type HandlerArg, readHandlerArgs } from './handler-args';
import { canUseTool, type McpTool } from './mcp-tool.type';
import { readMetadata, readPrototypeMember } from './read-metadata';
import { SWAGGER_API_OPERATION } from './swagger-metadata';

// `@Controller()` và `@Get()` ghi path là chuỗi hoặc mảng chuỗi; lấy phần tử đầu như Nest
// định tuyến
function firstPathSegment(pathMetadata: string | string[] | undefined): string {
  const segment = Array.isArray(pathMetadata) ? pathMetadata[0] : pathMetadata;

  return segment ?? '';
}

function joinRoutePath(
  controllerPath: string | string[] | undefined,
  handlerPath: string | string[] | undefined,
): string {
  return `/${firstPathSegment(controllerPath)}/${firstPathSegment(handlerPath)}`
    .replace(/\/+/g, '/')
    .replace(/(.)\/$/, '$1');
}

function isGetHandler(handler: unknown): handler is object {
  return (
    typeof handler === 'function' &&
    readMetadata<RequestMethod>(METHOD_METADATA, handler) === RequestMethod.GET
  );
}

// Invoker gọi thẳng method của controller nên bỏ qua guard, interceptor, pipe và filter khai ở
// route hay class; route có những thứ đó mà vào catalog thì sẽ mất kiểm tra một cách im lặng
const ROUTE_ENHANCER_METADATA_KEYS = [
  GUARDS_METADATA,
  INTERCEPTORS_METADATA,
  PIPES_METADATA,
  EXCEPTION_FILTERS_METADATA,
];

function assertNoRouteEnhancers(
  toolName: string,
  controller: Type<object>,
  handler: object,
): void {
  const enhancerKey = ROUTE_ENHANCER_METADATA_KEYS.find(
    (metadataKey) =>
      readMetadata(metadataKey, handler) !== undefined ||
      readMetadata(metadataKey, controller) !== undefined,
  );
  if (enhancerKey) {
    throw new Error(
      `mcp_catalog_invalid ${toolName}: route có "${enhancerKey}" mà MCP không chạy; xử lý trước khi đưa vào catalog`,
    );
  }
}

function assertValidToolName(name: string, domain?: McpDomain): McpDomain {
  if (
    name.length > MCP_TOOL_NAME_MAX_LENGTH ||
    !MCP_TOOL_NAME_PATTERN.test(name)
  ) {
    throw new Error(
      `mcp_catalog_invalid ${name}: tên phải theo <entity>_<${MCP_TOOL_ACTIONS.join('|')}>, tối đa ${MCP_TOOL_NAME_MAX_LENGTH} ký tự`,
    );
  }

  const resolvedDomain = domain ?? name.split('_')[0];
  if (!MCP_DOMAINS.includes(resolvedDomain as McpDomain)) {
    throw new Error(
      `mcp_catalog_invalid ${name}: tên không bắt đầu bằng domain (${MCP_DOMAINS.join(', ')}) nên entry phải khai domain`,
    );
  }

  return resolvedDomain as McpDomain;
}

function buildDescription(
  summary: string | undefined,
  hint: string,
  isPaginated: boolean,
): string {
  return [
    summary,
    hint,
    isPaginated && `Paginated: use page and limit (max ${MCP_MAX_PAGE_LIMIT}).`,
  ]
    .filter((part): part is string => Boolean(part))
    .map((part) => part.replace(/\.+$/, ''))
    .join('. ');
}

// Cùng quy tắc `PermissionsGuard`: khai ở method thì thắng khai ở class; route `@Public` không
// cần quyền
function readPermissions(
  controller: Type<object>,
  handler: object,
): PermissionCode[] {
  const isPublic =
    readMetadata<boolean>(IS_PUBLIC_KEY, handler) ??
    readMetadata<boolean>(IS_PUBLIC_KEY, controller);
  if (isPublic) {
    return [];
  }

  return (
    readMetadata<PermissionCode[]>(PERMISSIONS_KEY, handler) ??
    readMetadata<PermissionCode[]>(PERMISSIONS_KEY, controller) ??
    []
  );
}

function readToolInput(
  toolName: string,
  handlerArgs: HandlerArg[],
): z.ZodObject<z.ZodRawShape> {
  const shape: z.ZodRawShape = {};

  const addProperty = (propertyName: string, schema: z.ZodTypeAny) => {
    if (propertyName in shape) {
      throw new Error(
        `mcp_catalog_invalid ${toolName}: tham số "${propertyName}" bị khai hai lần`,
      );
    }
    shape[propertyName] = schema;
  };

  for (const handlerArg of handlerArgs) {
    if (handlerArg.kind === 'path-param') {
      addProperty(handlerArg.name, z.string().uuid());
    } else if (handlerArg.kind === 'query-dto') {
      for (const [propertyName, schema] of Object.entries(
        buildDtoShape(handlerArg.dto),
      )) {
        addProperty(propertyName, schema);
      }
    }
  }

  // `strict` để tham số lạ báo lỗi thay vì bị bỏ qua lặng lẽ
  return z.object(shape).strict();
}

/**
 * Dựng tool MCP từ catalog: mỗi tool là một route GET có sẵn, nên quyền, mô tả và tham số đọc từ
 * metadata của route thay vì khai lại. Catalog sai (không phải route GET, tên sai quy chuẩn, tham
 * số trùng) làm app dừng lúc khởi động; route GET chưa có tool chỉ bị log cảnh báo.
 */
@Injectable()
export class McpToolsRegistry implements OnApplicationBootstrap {
  private readonly logger = new Logger(McpToolsRegistry.name);
  private readonly toolByName = new Map<string, McpTool>();

  constructor(
    private readonly configService: ConfigService<AllConfigType>,
    private readonly discoveryService: DiscoveryService,
    private readonly metadataScanner: MetadataScanner,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.configService.get('mcp.apiKey', { infer: true })) {
      this.logger.log('mcp_disabled: MCP_API_KEY chưa đặt, không đăng ký tool');
      return;
    }

    for (const entry of MCP_CATALOG) {
      const tool = this.buildTool(entry);
      if (this.toolByName.has(tool.name)) {
        throw new Error(`mcp_catalog_invalid: tên tool trùng "${tool.name}"`);
      }
      this.toolByName.set(tool.name, tool);
    }

    this.reportRouteCoverage();
  }

  getTool(name: string): McpTool | undefined {
    return this.toolByName.get(name);
  }

  listVisibleTools(caller: McpCaller, domains?: McpDomain[]): McpTool[] {
    return [...this.toolByName.values()].filter(
      (tool) =>
        (!domains || domains.includes(tool.domain)) && canUseTool(tool, caller),
    );
  }

  private buildTool(entry: McpCatalogEntry): McpTool {
    const { name, title, hint, controller, method } = entry;
    const domain = assertValidToolName(name, entry.domain);
    const handler = readPrototypeMember(controller, method);
    if (!isGetHandler(handler)) {
      throw new Error(
        `mcp_catalog_invalid ${name}: ${controller.name}.${method} không phải route GET`,
      );
    }

    assertNoRouteEnhancers(name, controller, handler);

    const handlerArgs = readHandlerArgs(controller, method);
    const inputSchema = readToolInput(name, handlerArgs);
    const summary = readMetadata<{ summary?: string }>(
      SWAGGER_API_OPERATION,
      handler,
    )?.summary;
    // Khoá metadata Swagger bị đổi tên sẽ làm mô tả rỗng im lặng: dừng app thay vì chạy với
    // tool câm
    if (!summary) {
      throw new Error(
        `mcp_catalog_invalid ${name}: ${controller.name}.${method} thiếu summary trong @ApiAuth`,
      );
    }

    return {
      name,
      title,
      description: buildDescription(
        summary,
        hint,
        'page' in inputSchema.shape && 'limit' in inputSchema.shape,
      ),
      domain,
      permissions: readPermissions(controller, handler),
      inputSchema,
      controller,
      method,
      handlerArgs,
    };
  }

  private reportRouteCoverage(): void {
    const methodsByController = new Map<Type<object>, Set<string>>();
    for (const tool of this.toolByName.values()) {
      const methods = methodsByController.get(tool.controller) ?? new Set();
      methods.add(tool.method);
      methodsByController.set(tool.controller, methods);
    }

    let excludedCount = 0;
    const uncoveredRoutes: string[] = [];
    for (const route of this.listGetRoutes()) {
      if (methodsByController.get(route.controller)?.has(route.method)) {
        continue;
      }
      if (MCP_EXCLUDED_ROUTES.some((isExcluded) => isExcluded(route))) {
        excludedCount += 1;
        continue;
      }
      uncoveredRoutes.push(
        `${route.controller.name}.${route.method} GET ${route.path}`,
      );
    }

    for (const uncoveredRoute of uncoveredRoutes) {
      this.logger.warn(`mcp_route_not_covered ${uncoveredRoute}`);
    }
    this.logger.log(
      `mcp_tools_registered count=${this.toolByName.size} excluded=${excludedCount} uncovered=${uncoveredRoutes.length}`,
    );
  }

  private listGetRoutes(): McpRouteInfo[] {
    const routes: McpRouteInfo[] = [];
    for (const wrapper of this.discoveryService.getControllers()) {
      const controller = wrapper.metatype as Type<object> | null;
      if (!controller) {
        continue;
      }

      const controllerPath = readMetadata<string | string[]>(
        PATH_METADATA,
        controller,
      );
      for (const method of this.metadataScanner.getAllMethodNames(
        controller.prototype as object,
      )) {
        const handler = readPrototypeMember(controller, method);
        if (isGetHandler(handler)) {
          routes.push({
            controller,
            method,
            path: joinRoutePath(
              controllerPath,
              readMetadata<string | string[]>(PATH_METADATA, handler),
            ),
          });
        }
      }
    }

    return routes;
  }
}
