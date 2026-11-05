import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { ErrorCode as McpErrorCode } from '@modelcontextprotocol/sdk/types.js';
import {
  Controller,
  Delete,
  Get,
  HttpStatus,
  Logger,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';

import { ErrorCode } from '../../constants/error-code.constant';
import { Public } from '../../decorators/public.decorator';
import { AppException } from '../../exceptions/app.exception';
import { McpApiKeyGuard } from './guards/mcp-api-key.guard';
import { MCP_DOMAINS, type McpDomain } from './mcp.constant';
import { McpServerFactory } from './mcp-server.factory';

// Mã -32000 theo ví dụ 405 của SDK; trùng số với `ConnectionClosed` nên không dùng enum của SDK
const JSON_RPC_METHOD_NOT_ALLOWED = -32000;

function jsonRpcError(code: number, message: string) {
  return { jsonrpc: '2.0', error: { code, message }, id: null };
}

function parseDomains(domainsQuery?: string): McpDomain[] | undefined {
  if (!domainsQuery) {
    return undefined;
  }

  const requestedDomains = String(domainsQuery)
    .split(',')
    .map((domain) => domain.trim())
    .filter(Boolean);
  const unknownDomains = requestedDomains.filter(
    (domain) => !MCP_DOMAINS.includes(domain as McpDomain),
  );
  if (unknownDomains.length > 0) {
    throw new AppException(
      ErrorCode.V000,
      HttpStatus.UNPROCESSABLE_ENTITY,
      `Unknown domains: ${unknownDomains.join(', ')}. Valid: ${MCP_DOMAINS.join(', ')}`,
    );
  }

  return requestedDomains as McpDomain[];
}

/**
 * Endpoint MCP (Streamable HTTP) chạy stateless: mỗi POST dựng một server rồi đóng, không giữ
 * session, nên nhiều instance BE đứng sau load balancer không cần sticky.
 *
 * Rules:
 * - `@Public()` chỉ để bỏ qua JWT toàn cục; xác thực chỉ là `McpApiKeyGuard`, key hợp lệ đọc được
 *   mọi tool. Chưa có phân quyền theo người dùng; hạn mức tính theo IP của máy chủ gọi.
 * - Trả JSON thường (`enableJsonResponse`) thay vì SSE để `compression()` không giữ stream.
 * - Body đã được body parser đọc, nên truyền `request.body` cho transport.
 *
 * See `docs/CODEMAPS/mcp.md`.
 */
@ApiExcludeController()
@Public()
@Controller('mcp')
@UseGuards(McpApiKeyGuard, ThrottlerGuard)
export class McpController {
  private readonly logger = new Logger(McpController.name);

  constructor(private readonly serverFactory: McpServerFactory) {}

  @Post()
  async handleRequest(
    @Req() request: Request,
    @Res() response: Response,
    @Query('domains') domainsQuery?: string,
  ): Promise<void> {
    // MCP 2025-06-18 bỏ batch; SDK vẫn nhận tới 100 lời gọi trong một POST, vượt hạn mức theo
    // request
    if (Array.isArray(request.body)) {
      response
        .status(HttpStatus.BAD_REQUEST)
        .json(
          jsonRpcError(
            McpErrorCode.InvalidRequest,
            'Batch requests are not supported',
          ),
        );

      return;
    }

    const server = this.serverFactory.create(parseDomains(domainsQuery));
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    response.on('close', () => {
      void transport.close();
      void server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(request, response, request.body);
    } catch (error) {
      this.logger.error(
        'mcp_request_failed',
        error instanceof Error ? error.stack : String(error),
      );
      if (!response.headersSent) {
        response
          .status(HttpStatus.INTERNAL_SERVER_ERROR)
          .json(jsonRpcError(McpErrorCode.InternalError, 'Internal error'));
      }
    }
  }

  // Server stateless không mở luồng SSE (GET) và không có session để đóng (DELETE)
  @Get()
  rejectGet(@Res() response: Response): void {
    this.rejectMethod(response);
  }

  @Delete()
  rejectDelete(@Res() response: Response): void {
    this.rejectMethod(response);
  }

  private rejectMethod(response: Response): void {
    response
      .status(HttpStatus.METHOD_NOT_ALLOWED)
      .set('Allow', 'POST')
      .json(jsonRpcError(JSON_RPC_METHOD_NOT_ALLOWED, 'Method not allowed.'));
  }
}
