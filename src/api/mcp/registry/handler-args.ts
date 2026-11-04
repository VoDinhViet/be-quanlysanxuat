import {
  type ExecutionContext,
  ParseUUIDPipe,
  type PipeTransform,
  type Type,
} from '@nestjs/common';
import {
  CUSTOM_ROUTE_ARGS_METADATA,
  ROUTE_ARGS_METADATA,
} from '@nestjs/common/constants';
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum';

import { readMetadata } from './read-metadata';

export type CustomArgFactory = (
  data: unknown,
  context: ExecutionContext,
) => unknown;

export type HandlerArg =
  | { kind: 'query-dto'; index: number; dto: Type<object> }
  | { kind: 'path-param'; index: number; name: string }
  | {
      kind: 'custom';
      index: number;
      factory: CustomArgFactory;
      data: unknown;
    };

interface RouteArgMetadata {
  index: number;
  data?: unknown;
  pipes?: Array<PipeTransform | Type<PipeTransform>>;
  factory?: CustomArgFactory;
}

// Mọi path param của route đọc là `UUIDParam` (`ParseUUIDPipe`); pipe khác thì schema `uuid` sai
function isUuidParam(pipes: RouteArgMetadata['pipes']): boolean {
  return (
    pipes?.length === 1 &&
    (pipes[0] instanceof ParseUUIDPipe || pipes[0] === ParseUUIDPipe)
  );
}

/**
 * Đọc tham số của một handler GET từ metadata Nest ghi sẵn (`@Query()`, `@Param()`,
 * `@CurrentUser()`). Handler dùng kiểu tham số khác (body, request, response) thì ném lỗi: catalog
 * chỉ được trỏ vào route đọc thuần.
 */
export function readHandlerArgs(
  controller: Type<object>,
  method: string,
): HandlerArg[] {
  const routeArgs =
    readMetadata<Record<string, RouteArgMetadata>>(
      ROUTE_ARGS_METADATA,
      controller,
      method,
    ) ?? {};
  const metatypes =
    readMetadata<unknown[]>(
      'design:paramtypes',
      controller.prototype as object,
      method,
    ) ?? [];
  const where = `${controller.name}.${method}`;

  const handlerArgs = Object.entries(routeArgs).map(
    ([key, argMetadata]): HandlerArg => {
      const { index } = argMetadata;
      if (key.includes(CUSTOM_ROUTE_ARGS_METADATA)) {
        return {
          kind: 'custom',
          index,
          factory: argMetadata.factory as CustomArgFactory,
          data: argMetadata.data,
        };
      }

      const paramtype: RouteParamtypes = Number(key.split(':')[0]);
      if (
        paramtype === RouteParamtypes.QUERY &&
        argMetadata.data === undefined
      ) {
        return {
          kind: 'query-dto',
          index,
          dto: metatypes[index] as Type<object>,
        };
      }
      if (
        paramtype === RouteParamtypes.PARAM &&
        typeof argMetadata.data === 'string' &&
        isUuidParam(argMetadata.pipes)
      ) {
        return { kind: 'path-param', index, name: argMetadata.data };
      }

      throw new Error(
        `mcp_unsupported_handler_arg ${where}: tham số thứ ${index} (kiểu route ${paramtype}) không đọc được`,
      );
    },
  );

  return handlerArgs.sort((left, right) => left.index - right.index);
}
