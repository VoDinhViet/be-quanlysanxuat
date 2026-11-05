import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DiscoveryModule } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';

import { AllConfigType } from '../../config/config.type';
import { McpController } from './mcp.controller';
import { McpServerFactory } from './mcp-server.factory';
import { McpToolInvoker } from './registry/mcp-tool-invoker';
import { McpToolsRegistry } from './registry/mcp-tools.registry';

const ONE_MINUTE_MS = 60_000;

/**
 * MCP server chỉ đọc cho agent chat nội bộ. Mỗi tool là một route GET có sẵn của các module khác,
 * được gọi qua `ModuleRef` nên module này không phải import từng module nghiệp vụ.
 * `ThrottlerGuard` chỉ gắn bằng `@UseGuards` ở `McpController`, không phải guard toàn cục.
 */
@Module({
  imports: [
    DiscoveryModule,
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService<AllConfigType>) => ({
        throttlers: [
          {
            ttl: ONE_MINUTE_MS,
            limit: configService.getOrThrow('mcp.rateLimitPerMinute', {
              infer: true,
            }),
          },
        ],
      }),
    }),
  ],
  controllers: [McpController],
  providers: [McpToolsRegistry, McpToolInvoker, McpServerFactory],
})
export class McpModule {}
