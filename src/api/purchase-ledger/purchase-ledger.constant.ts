/**
 * Trạng thái một dòng sổ cái mua hàng — tính lúc đọc (`PurchaseLedgerService.getPurchaseLedgers`),
 * không lưu cột nào, theo SL báo giá / đặt / nhận của dòng đề xuất:
 * - `WAITING_TO_PURCHASE`: chưa báo giá, chưa đặt.
 * - `QUOTING`: có báo giá, chưa đặt.
 * - `ORDERED`: đã đặt, chưa nhập kho.
 * - `RECEIVING`: đã đặt, đã nhập về một phần (chưa đủ).
 * - `COMPLETED`: đặt đủ SL đề xuất và nhập đủ.
 * Xem `docs/domains/purchasing.md`.
 */
export enum PurchaseLedgerStatus {
  WAITING_TO_PURCHASE = 'WAITING_TO_PURCHASE',
  QUOTING = 'QUOTING',
  ORDERED = 'ORDERED',
  RECEIVING = 'RECEIVING',
  COMPLETED = 'COMPLETED',
}
