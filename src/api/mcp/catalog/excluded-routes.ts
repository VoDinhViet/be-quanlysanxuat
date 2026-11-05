import type { Type } from '@nestjs/common';

export interface McpRouteInfo {
  controller: Type<object>;
  method: string;
  // Đường dẫn đầy đủ không kèm tiền tố `api`, ví dụ `/orders/:orderId`
  path: string;
}

// Route chỉ phục vụ ô chọn của UI: tool `*_list` với `q` đã thay được
const DROPDOWN_ONLY_PATHS = new Set([
  '/clients/options',
  '/items/options',
  '/operations/options',
  '/users/options',
  '/operations/:operationId/assignments/ids',
]);

// Hạ tầng hoặc nhóm có cổng riêng, không phải dữ liệu nghiệp vụ cho nhân viên hỏi
const INFRASTRUCTURE_CONTROLLERS = new Set([
  'AppController',
  'AuthController',
  'FilesController',
  'HealthController',
  'McpController',
]);

// Route nói về người đang đăng nhập hoặc phạm vi công đoạn được phân công cho họ: MCP chưa có người
// dùng nên không chạy được. Làm lại khi có phân quyền theo người dùng.
const SIGNED_IN_USER_PATHS = new Set([
  '/users/me',
  '/users/me/permissions',
  '/reports/pending-approvals',
]);
const SIGNED_IN_USER_CONTROLLERS = new Set(['ProductionExecutionController']);

/**
 * Route GET cố ý không thành tool. Route GET nào không có trong catalog và không khớp quy tắc
 * dưới đây sẽ được log `mcp_route_not_covered` lúc khởi động.
 */
export const MCP_EXCLUDED_ROUTES: Array<(route: McpRouteInfo) => boolean> = [
  // Trả file nhị phân (Excel, PDF) hoặc file mẫu nhập; agent không dùng được, web đã có
  ({ path }) => /(^|\/)(export[\w-]*|import-template)$/.test(path),
  ({ path }) => DROPDOWN_ONLY_PATHS.has(path),
  ({ path }) => SIGNED_IN_USER_PATHS.has(path),
  ({ controller }) => SIGNED_IN_USER_CONTROLLERS.has(controller.name),
  ({ controller }) => INFRASTRUCTURE_CONTROLLERS.has(controller.name),
];
