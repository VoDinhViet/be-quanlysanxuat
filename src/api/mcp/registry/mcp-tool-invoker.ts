import {
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { instanceToPlain, plainToInstance } from 'class-transformer';
import { validate, type ValidationError } from 'class-validator';

import { ErrorCode } from '../../../constants/error-code.constant';
import { MCP_MAX_RESULT_CHARS } from '../mcp.constant';
import type { HandlerArg } from './handler-args';
import type { McpTool } from './mcp-tool.type';

interface ValidationIssue {
  field: string;
  messages: string[];
}

type ControllerHandler = (...handlerArgs: unknown[]) => unknown;

function errorResult(error: Record<string, unknown>): CallToolResult {
  return {
    isError: true,
    content: [{ type: 'text', text: JSON.stringify({ error }) }],
  };
}

function validationErrorResult(issues: ValidationIssue[]): CallToolResult {
  return errorResult({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    errorCode: ErrorCode.V000,
    message: 'Invalid arguments',
    details: issues,
  });
}

function flattenValidationErrors(
  errors: ValidationError[],
  parentPath = '',
): ValidationIssue[] {
  return errors.flatMap((error) => {
    const field = parentPath
      ? `${parentPath}.${error.property}`
      : error.property;
    const ownIssues = error.constraints
      ? [{ field, messages: Object.values(error.constraints) }]
      : [];

    return [
      ...ownIssues,
      ...flattenValidationErrors(error.children ?? [], field),
    ];
  });
}

// Factory của `@CurrentUser()` chỉ đọc `request.user`. MCP chưa có người dùng nên là `undefined`;
// chỉ route khai `omitArguments` ở catalog mới được dùng nó (registry kiểm lúc khởi động)
function createExecutionContext(): ExecutionContext {
  const request = { user: undefined };

  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

/**
 * Chạy một tool: gọi đúng method controller của route GET tương ứng, với tham số đã validate bằng
 * chính DTO của route. Phần việc `ValidationPipe`, `ClassSerializerInterceptor` và
 * `GlobalExceptionFilter` làm cho request HTTP được làm lại ở đây vì tool không đi qua pipeline đó.
 */
@Injectable()
export class McpToolInvoker {
  private readonly logger = new Logger(McpToolInvoker.name);

  constructor(private readonly moduleRef: ModuleRef) {}

  async invoke(
    tool: McpTool,
    validArguments: Record<string, unknown>,
  ): Promise<CallToolResult> {
    const startedAt = Date.now();
    const callResult = await this.run(tool, validArguments);
    this.logger.log(
      `mcp_tool_call tool=${tool.name} ok=${!callResult.isError} ms=${Date.now() - startedAt}`,
    );

    return callResult;
  }

  private async run(
    tool: McpTool,
    validArguments: Record<string, unknown>,
  ): Promise<CallToolResult> {
    try {
      const issues: ValidationIssue[] = [];
      const handlerArgs: unknown[] = [];
      for (const handlerArg of tool.handlerArgs) {
        handlerArgs[handlerArg.index] = await this.resolveArgument(
          handlerArg,
          validArguments,
          issues,
        );
      }
      if (issues.length > 0) {
        return validationErrorResult(issues);
      }

      const controller = this.moduleRef.get(tool.controller, { strict: false });
      const handler = controller[
        tool.method as keyof typeof controller
      ] as ControllerHandler;
      const controllerOutput: unknown = await handler.apply(
        controller,
        handlerArgs,
      );

      return this.toJsonResult(controllerOutput);
    } catch (error) {
      return this.toErrorResult(tool, error);
    }
  }

  private async resolveArgument(
    handlerArg: HandlerArg,
    validArguments: Record<string, unknown>,
    issues: ValidationIssue[],
  ): Promise<unknown> {
    if (handlerArg.kind === 'custom') {
      return handlerArg.factory(handlerArg.data, createExecutionContext());
    }

    if (handlerArg.kind === 'path-param') {
      return validArguments[handlerArg.name];
    }

    // Zod đã kiểm kiểu và trần của từng tham số; validate DTO lần nữa để luật riêng của DTO
    // (`@ValidateIf`, so sánh giữa các field) vẫn chạy y như trên REST
    const dto = plainToInstance(handlerArg.dto, validArguments);
    const errors = await validate(dto, { whitelist: true });
    issues.push(...flattenValidationErrors(errors));

    return dto;
  }

  private toJsonResult(controllerOutput: unknown): CallToolResult {
    const text = JSON.stringify(instanceToPlain(controllerOutput) ?? null);
    if (text.length > MCP_MAX_RESULT_CHARS) {
      return errorResult({
        status: HttpStatus.PAYLOAD_TOO_LARGE,
        message:
          'Result is too large. Narrow it with filters, a smaller limit or a later page.',
      });
    }

    return { content: [{ type: 'text', text }] };
  }

  private toErrorResult(tool: McpTool, error: unknown): CallToolResult {
    if (error instanceof HttpException) {
      const response = error.getResponse();
      const body: Record<string, unknown> =
        typeof response === 'string' ? { message: response } : { ...response };

      return errorResult({ status: error.getStatus(), ...body });
    }

    this.logger.error(
      `mcp_tool_failed tool=${tool.name}`,
      error instanceof Error ? error.stack : String(error),
    );

    return errorResult({
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal error',
    });
  }
}
