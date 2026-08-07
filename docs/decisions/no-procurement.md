# Không làm Procurement (mua hàng)

**Trạng thái:** còn hiệu lực — ranh giới phạm vi, không phải việc chưa kịp làm

## Bối cảnh

Hệ thống có `suppliers` (hồ sơ NCC đầy đủ: thanh toán, người đại diện, đính kèm, `creditLimit`),
có `items` (RM) với `supplierId` là NCC chính, có role `PROCUREMENT_MANAGER`, và có lý do phiếu kho
`PURCHASE`. Nhìn từ ngoài rất giống một ERP đã có mua hàng.

Không có. Đây là giả định sai tốn kém nhất với repo này.

## Quyết định

**Không có phiếu mua hàng, không có nhận hàng theo đơn mua, không có bảng giá NCC, không có công nợ.**

- `orders` là đơn **bán**, không phải đơn mua.
- `suppliers` thuần là master data — hồ sơ để tra cứu và để `items` (RM) trỏ tới.
- Vật tư vào kho bằng **phiếu nhập lập tay**: `inventory_receipts` với `receiptType = PURCHASE`.
  Từ đợt thiết kế lại kho (`docs/decisions/stored-inventory-balances.md`), phiếu này **có**
  `supplierId` (NCC đã giao), `purchaseRequestId` (đề xuất mua đã sinh ra nhu cầu, tuỳ chọn) và
  dòng phiếu có `unitPrice` (nullable) — nới đúng phần "chỗ cắm tương lai" đã nói ở bản trước của
  file này. Đây **vẫn không phải** một chứng từ mua hàng: không có xác nhận từ NCC, không có trạng
  thái đơn mua riêng biệt, `unitPrice` chỉ là thông tin ghi kèm dòng phiếu, không tổng hợp thành
  công nợ hay báo cáo theo NCC.
- `creditLimit` của NCC chỉ được lưu, chưa nơi nào đọc. `rating` là số nhập tay.

## Hệ quả

- Đừng đi tìm module/bảng mua hàng, và đừng suy ra procurement từ việc có `suppliers` + `items`
  hay từ việc phiếu nhập có `supplierId`/`unitPrice`.
- `PROCUREMENT_MANAGER` trong `role.constant.ts` chỉ là một tên role; role `PURCHASING` được seed
  chỉ có quyền trên `suppliers`/`items`, không có quyền nào liên quan mua hàng.
- Muốn biết đã nhập bao nhiêu vật tư: cộng các phiếu `PNK` có `receiptType = PURCHASE`, không có
  báo cáo tổng hợp theo NCC dù `supplierId` đã có trên từng phiếu.

## Nếu sau này làm

`supplierId`/`purchaseRequestId`/`unitPrice` trên `inventory_receipts`/`inventory_receipt_items`
đã là điểm cắm. Bước tiếp theo (nếu làm) là một chứng từ đơn mua riêng có trạng thái xác nhận/nhận
hàng của chính nó, đứng trước `inventory_receipts` trong luồng — phiếu nhập kho vẫn chỉ là bằng
chứng vật tư đã vào kho, không phải bằng chứng đã mua. Xem `docs/domains/partners.md` và
`docs/workflows/stock-movement.md`.

## Không nhầm với Purchase Requests

`docs/domains/purchase-requests.md` là phiếu xin duyệt nội bộ (ai cần vật tư gì, bao nhiêu) —
không phải procurement, không đảo ngược quyết định này. Không supplier, không giá, không nhận
hàng theo phiếu.
