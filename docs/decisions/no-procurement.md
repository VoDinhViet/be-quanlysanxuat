# Không làm Procurement (mua hàng)

**Trạng thái:** còn hiệu lực — ranh giới phạm vi, không phải việc chưa kịp làm

## Bối cảnh

Hệ thống có `suppliers` (hồ sơ NCC đầy đủ: thanh toán, người đại diện, đính kèm, `creditLimit`),
có `materials` với `supplierId` là NCC chính, có role `PROCUREMENT_MANAGER`, và có lý do phiếu kho
`PURCHASE`. Nhìn từ ngoài rất giống một ERP đã có mua hàng.

Không có. Đây là giả định sai tốn kém nhất với repo này.

## Quyết định

**Không có phiếu mua hàng, không có nhận hàng theo đơn mua, không có bảng giá NCC, không có công nợ.**

- `orders` là đơn **bán**, không phải đơn mua.
- `suppliers` thuần là master data — hồ sơ để tra cứu và để `materials` trỏ tới.
- Vật tư vào kho bằng **phiếu nhập lập tay**: `subject = MATERIAL`, `type = IN`,
  `reason = PURCHASE`. Phiếu này **không có `supplierId`** — không có chỗ nào ghi lại mua của ai.
- `creditLimit` của NCC chỉ được lưu, chưa nơi nào đọc. `rating` là số nhập tay.

## Hệ quả

- Đừng đi tìm module/bảng mua hàng, và đừng suy ra procurement từ việc có `suppliers` + `materials`.
- `PROCUREMENT_MANAGER` trong `role.constant.ts` chỉ là một tên role; role `PURCHASING` được seed
  chỉ có quyền trên `suppliers`/`materials`, không có quyền nào liên quan mua hàng.
- Muốn biết đã nhập bao nhiêu vật tư: cộng các phiếu `PNVT`, không có báo cáo theo NCC.

## Nếu sau này làm

Điểm cắm tự nhiên là thêm `supplierId` vào `stock_receipts` cho phiếu `MATERIAL`/`IN` trước, rồi mới
tính tới chứng từ đơn mua riêng. Xem `docs/domains/partners.md` và
`docs/workflows/stock-movement.md`.
