# Quality (Kiểm tra chất lượng)

## Purpose

Ghi nhận kết quả kiểm tra chất lượng hàng nhập (IQC — Incoming Quality Control): một vật tư từ một
NCC đạt hay không đạt, và nếu không đạt thì xử lý thế nào. Domain mới nhất trong hệ thống, phase 1
mới chỉ có `GET` list + `GET stats` + `POST` tạo — chưa có route sửa/nối tiếp vào phiếu trả NCC
thật.

## Core concepts

**Bảng phẳng, một dòng = một lần kiểm một vật tư.** Không có header/items như `inventory_receipts`
— khác `supplier_returns` (cũng phẳng) ở chỗ IQC không bắt buộc phải xuất phát từ một phiếu nhập
kho cụ thể: `inventoryReceiptId`/`purchaseOrderId` là tuỳ chọn, chỉ để trace ở mức chứng từ.
`supplierId`/`itemId`/`quantity` do IQC tự giữ (denormalized), không suy từ dòng nhập kho.

**Ba enum, một quy tắc suy `status` chạy đúng một lần lúc tạo:**

```
result       PASS | FAIL
disposition  CONCESSION | SORT | RETURN     — chỉ có nghĩa khi result = FAIL
status       PENDING | WAITING_RETURN | COMPLETED
```

- `result = PASS` → `status = COMPLETED` ngay, `disposition` phải để trống (`E139` nếu gửi kèm).
- `result = FAIL`, chưa gửi `disposition` → `status = PENDING` ("Chờ xử lý").
- `result = FAIL`, `disposition = CONCESSION` (chấp nhận đặc biệt — không cần trả hàng) →
  `status = COMPLETED` ngay.
- `result = FAIL`, `disposition = SORT` (phân loại) hoặc `RETURN` (trả NCC) — cả hai đều cần xuất
  hàng NG ra khỏi kho → `status = WAITING_RETURN` ("Chờ trả NCC").

`IqcService.resolveIqcStatus` là nơi duy nhất áp quy tắc này; `chk_iqc_inspections_disposition_
requires_fail` ở DB là chốt chặn cuối, không phải nơi tính `status`.

## Lifecycle

Không có route nào chuyển trạng thái sau khi tạo — `status` set một lần lúc `POST /iqc` rồi đứng
yên. Cụ thể, `WAITING_RETURN → COMPLETED` (sau khi hàng NG thật sự được xuất trả NCC) **chưa có
route** — đó là việc của phase sau, khi nối với `supplier_returns` (xem Related docs). Đừng tưởng
route đó đã tồn tại chỉ vì cột `supplier_returns.iqcId` đã sẵn.

## Business rules

- `code` bất biến, unique toàn bảng, tự sinh `IQC-{năm}-{đếm trong năm + 1, pad 5}` nếu không gửi
  — cùng khuôn `PNK`/`PXK` (`docs/domains/inventory.md`).
- `disposition` chỉ hợp lệ khi `result = FAIL` — validate ở service (`E139`) trước, DB CHECK
  (`chk_iqc_inspections_disposition_requires_fail`) là lớp phòng thủ thứ hai.
- `inventoryReceiptId`/`purchaseOrderId` không bắt buộc — hàng kiểm ngoài luồng PO (ví dụ NCC giao
  tay) vẫn tạo được IQC, dùng `reason` (text tự do) thay cho PO trên màn hiển thị "PO / Lý do".

## Invariants

- Không có FK mức dòng tới `purchase_order_items`/`inventory_receipt_items` — `purchase_order_
  items` không có số thứ tự dòng nên không tái tạo được kiểu hiển thị `PO2406001-01`; PO/NK trên
  IQC chỉ trace tới mức chứng từ.
- `itemId` không bị ràng buộc `type = RM` ở DB/service (giống mọi chỗ khác dùng `items` — xem
  `docs/domains/product-structure.md`), dù nghiệp vụ thực tế IQC luôn là vật tư nhập.

## Cross-domain dependencies

- **→ Inventory**: `inventoryReceiptId` liên kết tuỳ chọn tới phiếu nhập; `supplier_returns.iqcId`
  là chiều ngược lại (phiếu trả NCC trace được về lần IQC đã sinh ra nó, cũng tuỳ chọn — xem
  `docs/domains/inventory.md`).
- **→ Purchasing**: `purchaseOrderId` liên kết tuỳ chọn tới PO — thuần để trace, không đọc ngược.
- **→ Partners**: `supplierId` bắt buộc tới `suppliers`.
- **→ Product Structure**: `itemId` bắt buộc tới `items`.

## Common mistakes

1. **Tưởng `status` suy runtime từ `result`/`disposition` như một view.** Không — nó là cột lưu
   thật, set một lần lúc tạo; sửa `result`/`disposition` sau đó (chưa có route) sẽ không tự cập
   nhật `status`.
2. **Tưởng có route đổi `WAITING_RETURN` → `COMPLETED`.** Chưa có — đó là việc của phase nối với
   `supplier_returns.post` sau này.
3. **Đi tìm bảng con `iqc_items`.** Không có — bảng phẳng, 1 dòng = 1 lần kiểm 1 vật tư.

## Related docs

- `docs/domains/inventory.md` — `supplier_returns.iqcId`, nơi IQC `WAITING_RETURN` sẽ nối vào khi
  phase sau mở route tạo phiếu trả NCC thật.
- `docs/domains/purchasing.md` — `purchaseOrders` mà IQC trace tới.
- `docs/domains/partners.md` — `suppliers` mà IQC bắt buộc gắn vào.
