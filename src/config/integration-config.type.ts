export type IntegrationConfig = {
  // Khoá của hệ thống bên ngoài gọi `/api/v1/integration`; bỏ trống = tắt hẳn nhóm route này
  apiKey?: string;
  // Số request tối đa mỗi phút cho một khoá
  rateLimitPerMinute: number;
  // Giới hạn thời gian chạy một truy vấn (ms), tránh một lần gọi giữ kết nối DB quá lâu
  queryTimeoutMs: number;
};
