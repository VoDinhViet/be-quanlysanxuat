/**
 * Trạng thái tồn kho vật tư — tính lúc đọc (`InventoryService.getMaterialInventory`), không lưu
 * cột nào nên không cần `pgEnum`.
 *
 * Rules:
 * - `SHORTAGE`: `available < 0`.
 * - `WARNING`: `0 <= available < minStock`.
 * - `NORMAL`: `available >= minStock`.
 * - Đợt 2026-07-30: `bomDemand` luôn `0` (chưa nổ BOM) nên `available = onHand`, mà
 *   `StockReceiptsService.ensureSufficientStock` đã chặn tồn âm — `SHORTAGE` chưa bao giờ xuất
 *   hiện thực tế, chỉ `NORMAL`/`WARNING`. Hệ quả của phạm vi, không phải bug — xem
 *   `docs/features/inventory.md`.
 */
export enum MaterialStockStatus {
  NORMAL = 'NORMAL',
  WARNING = 'WARNING',
  SHORTAGE = 'SHORTAGE',
}
