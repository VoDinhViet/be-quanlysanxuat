import type { Type } from '@nestjs/common';

import type { McpDomain } from '../mcp.constant';

export interface McpCatalogEntry {
  name: string;
  // Chỉ cần khi tên không bắt đầu bằng tên domain (`order_list` thuộc `sales`)
  domain?: McpDomain;
  title: string;
  hint: string;
  // Tham số của route bị ẩn khỏi tool. Bắt buộc khi route đọc `@CurrentUser()`: MCP chưa có người
  // dùng, nên route chỉ được chạy khi các tham số cần người dùng (như `operationId`) không có mặt
  omitArguments?: string[];
  controller: Type<object>;
  method: string;
}

/**
 * Khai báo một tool trỏ vào một method GET của controller. `method` được kiểm theo kiểu của
 * controller nên gõ sai tên sẽ lỗi lúc biên dịch.
 *
 * Rules:
 * - `name` theo `<entity>_<action>` (`list`, `get`, `stats`, `summary`), chữ thường snake_case;
 *   thường có thêm tiền tố domain (`purchasing_order_list`).
 * - `title` là tên hiển thị tiếng Việt theo thuật ngữ nghiệp vụ.
 * - `hint` là một câu tiếng Anh nói khi nào dùng tool, kèm mã chứng từ (SO, DO, DMH, LSX, JOB...).
 */
export function defineMcpTool<TController extends Type<object>>(
  entry: Omit<McpCatalogEntry, 'controller' | 'method'> & {
    controller: TController;
    method: Extract<keyof InstanceType<TController>, string>;
  },
): McpCatalogEntry {
  return entry;
}
