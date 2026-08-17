/**
 * Tiến độ xử lý của một OS-IN — suy lúc đọc, không lưu cột. Khác `outsourcing_receipts.status`;
 * `COMPLETED`/`PARTIAL` tính trên các dòng OS-OUT mà phiếu chạm tới, không trên dòng của chính phiếu
 * này. `DRAFT` chỉ còn cho dữ liệu cũ trước khi bỏ nháp — không route nào tạo `DRAFT` nữa.
 */
export enum OutsourcingReceiptProgress {
  DRAFT = 'DRAFT',
  PARTIAL = 'PARTIAL',
  WAITING_QC = 'WAITING_QC',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}
