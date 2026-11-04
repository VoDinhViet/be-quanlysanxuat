// Trần số dòng của các route tổng hợp (`*-summary`, danh sách cảnh báo): một lần gọi không kéo cả
// bảng vào context của agent
export const SUMMARY_MAX_LIMIT = 50;
export const SUMMARY_DEFAULT_LIMIT = 20;

// Số ngày tối đa của các tham số "trong N ngày" (một năm)
export const SUMMARY_MAX_DAYS = 365;

// Mã chứng từ do người dùng gõ: chữ, số và vài dấu nối, không có khoảng trắng hay nháy
export const DOCUMENT_CODE_MAX_LENGTH = 40;
export const DOCUMENT_CODE_PATTERN = new RegExp(
  `^[A-Za-z0-9._/-]{1,${DOCUMENT_CODE_MAX_LENGTH}}$`,
);

export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
