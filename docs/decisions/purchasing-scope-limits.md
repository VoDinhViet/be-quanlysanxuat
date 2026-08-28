# Giới hạn phạm vi mua hàng

**Trạng thái:** còn hiệu lực (phần lớn nội dung gốc "không làm procurement" đã đảo ngược — xem
`docs/domains/purchasing.md` cho luồng thật: RFQ → PO → nhận hàng → yêu cầu thanh toán).

## Bối cảnh

Ban đầu hệ thống chủ động không làm mua hàng: `suppliers` chỉ là master data, vật tư vào kho bằng
phiếu nhập lập tay không qua đơn mua nào. Quyết định đó đã đảo phần lớn khi thêm
`purchase-quotations`/`purchase-orders`/`payment-requests`. File này giữ lại phần **vẫn chưa làm** —
ranh giới phạm vi hiện tại, để không ai tưởng nhầm là thiếu sót cần vá.

## Vẫn không làm

- Công nợ NCC tổng hợp (theo NCC, theo khoảng thời gian).
- Thanh toán từng phần cho một PO — `payment_requests` là 1 PO : 1 dòng YCTT, không chia nhỏ.
- Bảng giá NCC theo thời gian — giá chỉ nằm trên từng dòng báo giá/đơn mua, không có lịch sử
  giá theo NCC×vật tư.
- Tích hợp kế toán/ngân hàng thật, hoá đơn NCC — `mark-paid`/`cancel` chỉ đổi trạng thái, không ghi
  bút toán tiền.
- Duyệt đơn mua qua Giám đốc — `confirm` PO chỉ cần `purchasing:update`.
- `creditLimit` của NCC chỉ lưu, chưa route nào đọc. `defaultPaymentTerm` của
  `supplier_payment_info` chưa copy sang PO lúc tạo — `paymentTerm` vẫn chọn tay.

## Không nhầm với Purchase Requests

`docs/domains/purchase-requests.md` là phiếu xin duyệt nội bộ (ai cần vật tư gì) — không đổi.
`docs/domains/purchasing.md` chỉ bắt đầu từ đề xuất **đã duyệt**.

## Related docs

- `docs/domains/purchasing.md` — luồng RFQ/PO/thanh toán đầy đủ.
- `docs/domains/purchase-requests.md` — nguồn nhu cầu, không đổi.
- `docs/workflows/purchase-to-payment.md` — trình tự đầu-cuối.
