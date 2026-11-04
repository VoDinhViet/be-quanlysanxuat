export type McpConfig = {
  // Access key duy nhất của agent gọi `/api/mcp`; bỏ trống = tắt hẳn endpoint
  apiKey?: string;
  // Số request tối đa mỗi phút cho một nhân viên (credential)
  rateLimitPerMinute: number;
};
