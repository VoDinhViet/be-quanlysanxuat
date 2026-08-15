/**
 * Trạng thái tồn kho — tính lúc đọc (`InventoryService.getInventory`), không lưu cột nào nên không
 * cần `pgEnum`. Áp dụng cho mọi loại item (FG/WIP/RM), không riêng vật tư.
 *
 * Rules:
 * - `SHORTAGE`: `available < 0`.
 * - `WARNING`: `0 <= available < minStock`.
 * - `NORMAL`: `available >= minStock`.
 * - `available = onHand - reserved - bomDemand`. `bomDemand` luôn `0` (chưa nổ BOM) với mọi loại
 *   item, và `onHand` không bao giờ âm (DB CHECK trên `inventory_balances.quantity`) nên vế đó
 *   không kéo `available` xuống âm; `reserved` (chỉ khác 0 với FG có đơn mở) thì có thể, xem
 *   `docs/domains/inventory.md`.
 */
export enum StockStatus {
  NORMAL = 'NORMAL',
  WARNING = 'WARNING',
  SHORTAGE = 'SHORTAGE',
}
