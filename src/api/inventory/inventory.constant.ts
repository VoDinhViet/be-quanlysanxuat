/**
 * Trạng thái tồn kho — chỉ dùng để lọc (`stockStatusCondition`, tham số `status` của
 * `GET /inventory-products`/`GET /inventory-directs`), không trả trên response: FE tự suy từ
 * `available`/`minStock`. Không lưu cột nào nên không cần `pgEnum`; cùng công thức cho FG và DIRECT.
 *
 * Rules:
 * - `SHORTAGE`: `available < 0`.
 * - `WARNING`: `0 <= available < minStock`.
 * - `NORMAL`: `available >= minStock`.
 * - `available = onHand - reserved - bomDemand`, công thức đầy đủ ở `docs/CODEMAPS/inventory.md`.
 */
export enum StockStatus {
  NORMAL = 'NORMAL',
  WARNING = 'WARNING',
  SHORTAGE = 'SHORTAGE',
}
