import { formatToolResult } from './ai-tool.result';

export enum ToolErrorCode {
  FORBIDDEN = 'FORBIDDEN',
}

/** Error payload a tool returns (never throws) so the model can explain it to the user. */
export function createToolError(code: ToolErrorCode, message: string): string {
  return formatToolResult({ error: code, message });
}

export function createForbiddenToolError(): string {
  return createToolError(
    ToolErrorCode.FORBIDDEN,
    'Bạn không có quyền xem dữ liệu này',
  );
}
