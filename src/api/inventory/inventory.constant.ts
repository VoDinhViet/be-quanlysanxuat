/**
 * Trạng thái tồn kho — chỉ dùng để lọc (`stockStatusCondition`, tham số `status` của
 * `GET /inventory-products`/`GET /inventory-materials`), không trả trên response: FE tự suy từ
 * `available`/`minStock` để hiển thị. Không lưu cột nào nên không cần `pgEnum`. Công thức áp dụng
 * cho mọi loại item (FG/WIP/RM) như nhau, không riêng vật tư.
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
