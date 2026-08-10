/**
 * Trạng thái một dòng sổ cái mua hàng — tính lúc đọc (`PurchaseLedgerService.getPurchaseLedger`),
 * không lưu cột nào. Đánh giá theo đúng thứ tự khai báo, dừng ở nhánh khớp đầu tiên — xem bảng đầy
 * đủ ở `docs/domains/purchasing.md`.
 */
export enum PurchaseLedgerStatus {
  CANCELLED = 'CANCELLED',
  COMPLETED = 'COMPLETED',
  RECEIVING = 'RECEIVING',
  PURCHASED = 'PURCHASED',
  PENDING_PURCHASE = 'PENDING_PURCHASE',
  QUOTED = 'QUOTED',
  NOT_QUOTED = 'NOT_QUOTED',
}
