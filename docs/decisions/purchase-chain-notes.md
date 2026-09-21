# Ghi chú xuyên suốt chuỗi mua hàng — đọc gộp, không log chung

**Trạng thái:** còn hiệu lực. Không domain nào sở hữu — xuyên `purchase-requests`, `purchasing`,
`inventory`.

## Bối cảnh

`purchase_quotations.note`, `purchase_orders.note`, `inventory_receipts.note` đã có sẵn (mỗi bảng 1
cột đơn, ghi đè, không lịch sử/tác giả); `purchase_requests` (ĐXMH) chưa có cột `note` ở header —
chỉ có ghi chú theo từng dòng `purchase_request_items.note`. Khi xử lý một chứng từ ở giữa chuỗi
(vd. đang xem một Đơn mua hàng), người dùng không thấy được ghi chú đã ghi ở ĐXMH gốc hay ở Báo giá
đã chọn — phải mở từng màn hình để tra.

## Quyết định

1. **Thêm `purchase_requests.note`** cho đủ 4/4 chứng từ trong chuỗi cùng có cột `note` đơn, kèm
   route riêng `PATCH /purchase-requests/:purchaseRequestId/note` (sửa được ở mọi trạng thái, cùng
   khuôn `ProductionOrdersService.updateProductionOrderNote` — không transaction vì chỉ 1 write,
   `purchase_requests` không có bảng log nên không ghi lịch sử thao tác). 3 chứng từ kia đã có note
   sửa được qua chính route update chung của chúng từ trước. **Không dựng bảng log nhiều dòng**
   kiểu `production_job_notes` (đã cân nhắc, người dùng chọn giữ nguyên field đơn — đừng đề xuất
   lại log chung nếu không có yêu cầu mới).
2. **Đọc gộp bằng cách đi lại toàn bộ chuỗi item**, không chỉ dựa 2 FK trace sẵn có trên
   `inventory_receipts` (`purchaseRequestId`/`purchaseOrderId`) — 2 FK đó có thể null, và hoàn toàn
   bỏ sót Báo giá (không có FK `inventory_receipts → purchase_quotations` ở bất kỳ cấp nào). Chuỗi
   liên kết là liên kết lỏng ở **cấp dòng** (item), không phải 1-1: 1 dòng ĐXMH có thể tách sang
   nhiều báo giá/đơn mua khác nhau.
3. Module mới `src/api/purchase-notes/` — chỉ 1 `PurchaseNotesService`, **không có controller/route
   riêng**. 4 controller sẵn có (`purchase-requests`, `purchase-quotations`, `purchase-orders`,
   `inventory-receipts`) tự thêm route con `GET :id/related-notes` gọi thẳng vào service này, tái
   dùng permission đọc đã có của module đó — không có permission mới.

## Sơ đồ FK dùng để đọc gộp

```
purchase_requests (id, note)
   └─ purchase_request_items.purchase_request_id → purchase_requests.id            [cascade]
         │
         ├─ purchase_quotation_item_allocations.purchase_request_item_id → purchase_request_items.id   [restrict]
         │     └─ .quotation_item_id → purchase_quotation_items.id                  [cascade]
         │           └─ .quotation_id → purchase_quotations.id (note)               [cascade]
         │
         └─ purchase_order_items.purchase_request_item_id → purchase_request_items.id   [restrict]
               ├─ .purchase_order_id → purchase_orders.id (note)                    [cascade]
               └─ .quotation_item_supplier_id → purchase_quotation_item_suppliers.id [set null]
                     └─ .quotation_item_id → purchase_quotation_items.id  (cùng bảng con ở trên)

purchase_orders.quotation_id → purchase_quotations.id                               [set null] (đường tắt header, PO sinh từ duyệt RFQ)

inventory_receipts.purchase_request_id → purchase_requests.id                       [set null]
inventory_receipts.purchase_order_id   → purchase_orders.id                         [set null]
inventory_receipt_items.purchase_order_item_id → purchase_order_items.id            [set null]  (bắt các phiếu kho mà 2 FK header ở trên bị null)
```

Không có FK `inventory_receipts → purchase_quotations` ở bất kỳ cấp nào — Báo giá liên quan tới một
phiếu kho chỉ suy ra được gián tiếp qua `purchase_order_id`/`purchase_request_id` đã gom được.
`purchase_quotation_items` có 2 con song song (không lồng nhau): `purchase_quotation_item_suppliers`
và `purchase_quotation_item_allocations` — cả hai cùng trỏ `quotation_item_id`, không trỏ vào nhau.

## Cách triển khai

`PurchaseNotesService` có 4 method public (`getChainNotesFromRequest/Quotation/Order/Receipt`), mỗi
method ứng với 1 điểm xuất phát. Để tránh lặp lại logic join 4 lần, các method này ghép lại từ một
tập helper `private`, mỗi helper đúng 1 chặng trong sơ đồ FK ở trên (nhận mảng id, trả mảng id đã
khử trùng lặp, mảng vào rỗng thì trả `[]` luôn — không query). Không dùng `WITH RECURSIVE` — đồ thị
có độ sâu cố định (≤ 3 hop mỗi hướng).

## Đừng hoàn lại

- Đừng gộp 4 cột `note` thành 1 bảng log chung nếu không có yêu cầu mới — đã cân nhắc lúc thiết kế,
  người dùng chọn giữ đơn giản (không cần lịch sử/tác giả ở giai đoạn này).
- Đừng rút gọn việc gom id về chỉ dựa 2 FK trace trên `inventory_receipts` — sẽ bỏ sót Báo giá và
  các phiếu kho có 2 FK đó null dù vẫn liên kết được qua cấp dòng.
