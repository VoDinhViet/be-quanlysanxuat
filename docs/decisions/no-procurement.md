# Không làm Procurement (mua hàng)

**Trạng thái:** đã đảo ngược — xem `docs/domains/purchasing.md`. Giữ file này lại vì nó vẫn giải
thích đúng vì sao `suppliers`/`creditLimit`/`rating` từng nằm không dùng, và ranh giới cũ (công nợ,
bảng giá NCC theo thời gian) **vẫn còn hiệu lực** — phần "không có phiếu mua hàng" đã đảo, và phần
"thanh toán" đã đảo **một phần nhỏ** (bảng `payment_requests`, xem mục "Đã đảo ngược — phần nào"
bên dưới).

## Bối cảnh

Hệ thống có `suppliers` (hồ sơ NCC đầy đủ: thanh toán, người đại diện, đính kèm, `creditLimit`),
có `items` (RM) với `supplierId` là NCC chính, có role `PROCUREMENT_MANAGER`, và có lý do phiếu kho
`PURCHASE`. Nhìn từ ngoài rất giống một ERP đã có mua hàng.

Không có. Đây là giả định sai tốn kém nhất với repo này.

## Quyết định gốc (2026 trở về trước)

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

## Đã đảo ngược — phần nào

`docs/domains/purchasing.md` (module `purchase-quotations`/`purchase-orders`, đọc từ sổ cái
`GET /purchase-ledger`) thêm **báo giá** (RFQ) và **đơn mua** (PO) thật — có xác nhận từ NCC (trạng
thái báo giá `RECEIVED`), có trạng thái đơn mua riêng (`ORDERED`), và `inventory_receipts`/
`inventory_receipt_items` giờ nối tới đúng dòng đơn mua qua `purchaseOrderId`/`purchaseOrderItemId`.
`supplierId`/`unitPrice` trên phiếu nhập vẫn giữ nguyên vai trò cũ (ghi kèm, không tổng hợp).

Đợt sau (`payment-requests`, `docs/domains/purchasing.md`) đảo tiếp một phần nhỏ của "thanh toán":
mỗi PO đã nhận đủ hàng (`progress = COMPLETED`) tự sinh một **yêu cầu thanh toán**
(`payment_requests`, 1 PO : 1 dòng, không thanh toán từng phần) — đánh dấu Đã thanh toán/Hủy qua
`POST /payment-requests/:id/mark-paid`/`.../cancel`. Đây **vẫn không phải** thanh toán/kế toán thật:
không ghi bút toán tiền, không tích hợp ngân hàng, không có hoá đơn NCC.

**Vẫn không làm**: công nợ NCC tổng hợp (theo NCC, theo khoảng thời gian), thanh toán từng phần cho
một PO, bảng giá NCC theo thời gian (giá chỉ nằm trên từng dòng báo giá/đơn mua, không có lịch sử
giá theo NCC×vật tư), tích hợp kế toán/ngân hàng thật, hoá đơn NCC, duyệt đơn mua qua Giám đốc.
`creditLimit` vẫn chỉ lưu, chưa route nào đọc. `defaultPaymentTerm` của `supplier_payment_info` vẫn
chưa được copy sang PO lúc tạo — `paymentTerm` của PO vẫn phải chọn tay.

## Hệ quả

- `PROCUREMENT_MANAGER` trong `role.constant.ts` vẫn chỉ là một tên role chưa gán; role `PURCHASING`
  được seed nắm quyền `purchasing:*` — đây **là** quyền mua hàng thật, không còn đúng câu "không có
  quyền nào liên quan mua hàng" của bản quyết định gốc.
- Muốn biết đã nhập bao nhiêu vật tư theo từng dòng đề xuất: đọc `GET /purchase-ledger`
  (`receivedQuantity`), không cần tự cộng phiếu `PNK` nữa như bản quyết định gốc mô tả.

## Không nhầm với Purchase Requests

`docs/domains/purchase-requests.md` vẫn là phiếu xin duyệt nội bộ (ai cần vật tư gì, bao nhiêu) —
không đổi. Domain `purchasing` chỉ bắt đầu từ đề xuất **đã duyệt** (`APPROVED`), không đảo ngược gì
ở tầng xin duyệt.
