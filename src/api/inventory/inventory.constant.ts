/**
 * Trạng thái tồn kho — tính lúc đọc (`InventoryService.getInventory`), không lưu cột nào nên không
 * cần `pgEnum`. Công thức áp dụng cho mọi loại item (FG/WIP/RM) như nhau, không riêng vật tư — dù
 * `GET /inventory` mặc định chỉ trả FG/RM (`docs/decisions/wip-not-stocked.md`).
 *
 * Rules:
 * - `SHORTAGE`: `available < 0`.
 * - `WARNING`: `0 <= available < minStock`.
 * - `NORMAL`: `available >= minStock`.
 * - `available = onHand - reserved - bomDemand`, công thức đầy đủ ở `docs/domains/inventory.md`.
 */
export enum StockStatus {
  NORMAL = 'NORMAL',
  WARNING = 'WARNING',
  SHORTAGE = 'SHORTAGE',
}
