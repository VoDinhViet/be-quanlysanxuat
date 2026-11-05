export const MCP_API_KEY_HEADER = 'api-key';

// `PageOptionsDto` không có trần `limit`, nên MCP tự đặt để một lần gọi không kéo cả bảng vào
// context
export const MCP_DEFAULT_PAGE_LIMIT = 20;
export const MCP_MAX_PAGE_LIMIT = 50;

// Header HTTP chặn query string ~16 KB, còn tham số tool đi trong body tới 1 MB: tự đặt trần để một
// `q` hay mảng id khổng lồ không biến thành `ILIKE`/`IN (...)` nặng cho DB
export const MCP_MAX_ARGUMENT_LENGTH = 500;
export const MCP_MAX_ARGUMENT_ITEMS = 100;

// Trần kích thước một kết quả tool (ký tự); vượt thì báo thu hẹp bộ lọc thay vì cắt JSON giữa chừng
export const MCP_MAX_RESULT_CHARS = 500_000;

export const MCP_DOMAINS = [
  'sales',
  'purchasing',
  'inventory',
  'product',
  'production',
  'quality',
  'report',
  'org',
] as const;

export type McpDomain = (typeof MCP_DOMAINS)[number];

// list lọc và phân trang, get lấy một chứng từ theo id, stats/summary là số liệu tổng hợp
export const MCP_TOOL_ACTIONS = ['list', 'get', 'stats', 'summary'] as const;

export const MCP_TOOL_NAME_MAX_LENGTH = 64;

// <entity>_<action> với ít nhất một đoạn entity; domain là đoạn đầu của tên nếu đoạn đó là một
// domain, còn không thì entry catalog phải khai `domain` (nhóm bán hàng dùng tên module cũ)
export const MCP_TOOL_NAME_PATTERN = new RegExp(
  `^[a-z0-9]+(_[a-z0-9]+)*_(${MCP_TOOL_ACTIONS.join('|')})$`,
);
