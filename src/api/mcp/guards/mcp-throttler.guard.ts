import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { isUUID } from 'class-validator';
import type { Request } from 'express';

import { MCP_ON_BEHALF_OF_HEADER } from '../mcp.constant';

/**
 * Agent gọi từ một máy chủ nên mọi nhân viên chung một IP: tính hạn mức theo credential để một
 * người hỏi dồn dập không làm nghẽn cả công ty. Chạy trước `McpCallerGuard` để request vượt hạn
 * mức bị chặn trước khi tốn truy vấn DB; header sai định dạng rơi về IP.
 */
@Injectable()
export class McpThrottlerGuard extends ThrottlerGuard {
  protected getTracker(request: Record<string, any>): Promise<string> {
    const { headers, ip } = request as Request;
    const credentialId = headers[MCP_ON_BEHALF_OF_HEADER];

    return Promise.resolve(
      typeof credentialId === 'string' && isUUID(credentialId)
        ? credentialId
        : (ip ?? 'unknown'),
    );
  }
}
