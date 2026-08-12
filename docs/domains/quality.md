# Quality (Kiểm tra chất lượng)

## Purpose

Ghi nhận kết quả kiểm tra chất lượng hàng nhập (IQC — Incoming Quality Control): một vật tư từ một
NCC đạt hay không đạt, và nếu không đạt thì xử lý thế nào. Domain mới nhất trong hệ thống. Phase 1
chỉ có `GET` list + `GET stats` + `POST` tạo; phase 2 thêm `GET :iqcId` (chi tiết) và `POST
:iqcId/confirm` (chạy AQL sampling, xác nhận PASS/FAIL cho dòng chưa kiểm); phase 3 thêm `POST
:iqcId/resolve` (chọn phương án xử lý cho dòng FAIL đang chờ xử lý); phase 4 thêm `PATCH :iqcId`
(sửa lại 4 field ngữ cảnh sau confirm — không đụng PASS/FAIL) — vẫn chưa có route sửa tự do cho
`inspectionLevel`/`aqlLevel`/`sampleSize`/`defectQty`/`result`/`disposition`, và dòng
`WAITING_RETURN` vẫn chưa nối tiếp vào phiếu trả NCC thật.

## Core concepts

**Bảng phẳng, một dòng = một lần kiểm một vật tư.** Không có header/items như `inventory_receipts`
— khác `supplier_returns` (cũng phẳng) ở chỗ IQC không bắt buộc phải xuất phát từ một phiếu nhập
kho cụ thể: `inventoryReceiptId`/`purchaseOrderId` là tuỳ chọn, chỉ để trace ở mức chứng từ.
`supplierId`/`itemId`/`quantity` do IQC tự giữ (denormalized), không suy từ dòng nhập kho.

**Ba enum, một quy tắc suy `status`:**

```
result       PASS | FAIL                                — nullable (chưa kiểm = NULL)
disposition  CONCESSION | SORT | RETURN     — chỉ có nghĩa khi result = FAIL
status       NOT_INSPECTED | PENDING | WAITING_RETURN | COMPLETED
```

- Tạo mới không gửi `result` → `status = NOT_INSPECTED` ("Chưa kiểm") — dòng tồn tại nhưng chưa
  chạy AQL sampling. Đây là `status` duy nhất còn đổi được sau khi tạo, đúng một lần, qua `POST
  /iqc/:iqcId/confirm` (xem mục AQL sampling bên dưới).
- `result = PASS` → `status = COMPLETED` ngay, `disposition` phải để trống (`E139` nếu gửi kèm).
- `result = FAIL`, chưa gửi `disposition` → `status = PENDING` ("Chờ xử lý").
- `result = FAIL`, `disposition = CONCESSION` (chấp nhận đặc biệt — không cần trả hàng) →
  `status = COMPLETED` ngay.
- `result = FAIL`, `disposition = SORT` (phân loại) hoặc `RETURN` (trả NCC) — cả hai đều cần xuất
  hàng NG ra khỏi kho → `status = WAITING_RETURN` ("Chờ trả NCC").

`IqcService.resolveIqcStatus` là nơi duy nhất áp quy tắc này — dùng chung cho cả `POST /iqc` (khi
gửi `result` ngay lúc tạo) lẫn `POST /iqc/:iqcId/confirm` (khi `result` do server tự tính từ AQL
sampling); `chk_iqc_inspections_disposition_requires_fail` ở DB là chốt chặn cuối, không phải nơi
tính `status`.

## AQL sampling (`POST /iqc/:iqcId/confirm`)

Một dòng `NOT_INSPECTED` được xác nhận QC bằng lấy mẫu theo AQL (ANSI/ASQ Z1.4, lấy mẫu đơn, kiểm
tra thường) — dùng `quantity` của chính dòng IQC làm "lot size":

1. `(quantity, inspectionLevel, aqlLevel)` → tra `LOT_SIZE_CODE_LETTER` ra code letter → tra
   `SAMPLING_PLAN` ra `sampleSize` đề xuất + cặp Ac/Re — `resolveAqlPlan()` ở
   `src/api/iqc/iqc-aql.constant.ts`, dùng chung cho preview (FE) và tính `result` thật (service).
2. User sửa tay được `sampleSize` (không bắt buộc đúng bảng tra) rồi nhập `defectQty`.
3. Server tự tính `result` từ `defectQty` so với Ac/Re tra được ở bước 1 — **không nhận `result` từ
   client**, tránh client tự gửi PASS giả: `defectQty <= ac` → PASS, ngược lại FAIL.
4. Một dòng chỉ confirm được một lần — `status` phải đang `NOT_INSPECTED`, ngược lại `E141` (409).
   Confirm cũng ghi `confirmedBy`/`confirmedAt`.
5. Confirm còn ghi được 4 thông tin ngữ cảnh, cả 4 đều tùy chọn: `inspectionStandard` (tiêu chuẩn
   kiểm, vd "VT-0152 Rev.02"), `inspectorName` (tên người kiểm thực tế), `measuringTools` (dụng cụ
   đo đã dùng) — cả 3 là text tự do, không tra bảng danh mục — và `inspectionDate` (sửa lại thời
   điểm kiểm thực tế nếu khác ngày tạo). `inspectorName` là text tự do, **tách biệt** với
   `confirmedBy` (tài khoản bấm nút "Xác nhận QC"): người kiểm thật ngoài xưởng có thể không có
   tài khoản trong hệ thống.

⚠️ Bảng `SAMPLING_PLAN` (Ac/Re theo từng code letter × AQL) hiện chỉ điền một phần dữ liệu mẫu, cần
QC/kỹ thuật đối chiếu bảng chuẩn giấy trước khi coi là số liệu chính thức.

## Xử lý QC FAIL (`POST /iqc/:iqcId/resolve`)

Một dòng `PENDING` (FAIL, chưa có `disposition`) được chọn phương án xử lý:

1. Chỉ hợp lệ khi `status = PENDING` — ngược lại `E143` (409). Bao trùm cả 2 case: dòng chưa từng
   confirm (còn `NOT_INSPECTED`/PASS) lẫn dòng đã resolve rồi (đã `WAITING_RETURN`/`COMPLETED`).
2. Nhận đúng 1 field `disposition` (`CONCESSION`/`SORT`/`RETURN`) — không nhận `result` hay đổi lại
   AQL sampling đã chốt ở bước confirm.
3. Gọi lại chính `resolveIqcStatus(IqcResult.FAIL, disposition)` (dùng chung với `POST /iqc` và
   `POST /iqc/:iqcId/confirm`, xem "Ba enum" ở trên) để suy `status` mới — không viết lại rule ở
   đây: `CONCESSION` → `COMPLETED` ngay, `SORT`/`RETURN` → `WAITING_RETURN`.
4. Ghi `resolvedBy`/`resolvedAt` — tách biệt với `confirmedBy`/`confirmedAt` (hành động confirm
   AQL và hành động chọn phương án xử lý có thể do người khác nhau, ở thời điểm khác nhau).

## Sửa thông tin ngữ cảnh sau confirm (`PATCH /iqc/:iqcId`)

Chỉ sửa được 4 field ngữ cảnh set lúc confirm — `inspectionStandard`/`inspectorName`/
`measuringTools`/`inspectionDate` — **không** đụng tới `inspectionLevel`/`aqlLevel`/`sampleSize`/
`defectQty`/`result`: 4 field đó quyết định PASS/FAIL, khoá cứng vĩnh viễn sau confirm, không có
route nào sửa lại (xem "Common mistakes" bên dưới).

1. Chỉ hợp lệ khi `status !== NOT_INSPECTED` — dòng phải confirm trước đã mới có thông tin ngữ
   cảnh để sửa, ngược lại `E144` (409). Hợp lệ ở **mọi** status sau đó (`PENDING`/`WAITING_RETURN`/
   `COMPLETED`) — 4 field này không tham gia bất kỳ luồng nghiệp vụ nào nên không cần khoá theo
   status như `confirm`/`resolve`.
2. Ngữ nghĩa PATCH chuẩn: thiếu key = giữ nguyên, gửi `null` tường minh mới xoá (3 field text).
   `inspectionDate` không nullable (cột `NOT NULL`) nên không có ca "xoá" — chỉ có "đổi ngày" hoặc
   "không gửi = giữ nguyên".
3. Không ghi actor/timestamp riêng cho hành động sửa này (khác `confirmedBy`/`resolvedBy`) — đây
   chỉ là sửa lỗi nhập liệu, không phải một mốc nghiệp vụ mới cần trace.

## Lifecycle

`status` set lúc `POST /iqc`, đổi đúng một lần nữa qua `POST /iqc/:iqcId/confirm` khi còn
`NOT_INSPECTED` (xem AQL sampling ở trên), và đổi đúng một lần nữa qua `POST /iqc/:iqcId/resolve`
khi còn `PENDING` (xem "Xử lý QC FAIL" ở trên) — ngoài ba điểm đó, không có route nào khác chuyển
trạng thái. Cụ thể, `WAITING_RETURN → COMPLETED` (sau khi hàng NG thật sự được xuất trả NCC) **chưa
có route** — đó là việc của phase sau, khi nối với `supplier_returns` (xem Related docs). Đừng
tưởng route đó đã tồn tại chỉ vì cột `supplier_returns.iqcId` đã sẵn.

## Business rules

- `code` bất biến, unique toàn bảng, tự sinh `IQC-{năm}-{đếm trong năm + 1, pad 5}` nếu không gửi
  — cùng khuôn `PNK`/`PXK` (`docs/domains/inventory.md`).
- `disposition` chỉ hợp lệ khi `result = FAIL` — validate ở service (`E139`) trước, DB CHECK
  (`chk_iqc_inspections_disposition_requires_fail`) là lớp phòng thủ thứ hai.
- `inventoryReceiptId`/`purchaseOrderId` không bắt buộc — hàng kiểm ngoài luồng PO (ví dụ NCC giao
  tay) vẫn tạo được IQC, dùng `reason` (text tự do) thay cho PO trên màn hiển thị "PO / Lý do".
- `inspectionLevel`/`aqlLevel`/`sampleSize`/`defectQty`/`inspectionStandard`/`inspectorName`/
  `measuringTools`/`confirmedBy`/`confirmedAt` đều nullable — chỉ có giá trị sau khi
  `POST /iqc/:iqcId/confirm` chạy; trước đó (`NOT_INSPECTED`) là `NULL`.
- `resolvedBy`/`resolvedAt` cũng nullable — chỉ có giá trị sau khi `POST /iqc/:iqcId/resolve` chạy
  (dòng FAIL đã được chọn phương án xử lý); tách biệt với `confirmedBy`/`confirmedAt`.
- `inspectionDate` là `timestamp` (có giờ) — set lúc tạo, sửa lại được đúng một lần lúc confirm
  (xem "AQL sampling" ở trên).

## Invariants

- Không có FK mức dòng tới `purchase_order_items`/`inventory_receipt_items` — `purchase_order_
  items` không có số thứ tự dòng nên không tái tạo được kiểu hiển thị `PO2406001-01`; PO/NK trên
  IQC chỉ trace tới mức chứng từ.
- `itemId` không bị ràng buộc `type = RM` ở DB/service (giống mọi chỗ khác dùng `items` — xem
  `docs/domains/product-structure.md`), dù nghiệp vụ thực tế IQC luôn là vật tư nhập.
- CHECK `sample_size > 0` / `defect_qty >= 0` / `aql_level` giới hạn trong tập giá trị chuẩn
  (0.65/1.0/1.5/2.5/4.0/6.5) khi các cột này có giá trị — chốt chặn cuối, không phải nơi tính plan
  AQL (đó là `resolveAqlPlan()`).

## Cross-domain dependencies

- **→ Inventory**: `inventoryReceiptId` liên kết tuỳ chọn tới phiếu nhập; `supplier_returns.iqcId`
  là chiều ngược lại (phiếu trả NCC trace được về lần IQC đã sinh ra nó, cũng tuỳ chọn — xem
  `docs/domains/inventory.md`).
- **→ Purchasing**: `purchaseOrderId` liên kết tuỳ chọn tới PO — thuần để trace, không đọc ngược.
- **→ Partners**: `supplierId` bắt buộc tới `suppliers`.
- **→ Product Structure**: `itemId` bắt buộc tới `items`.

## Common mistakes

1. **Tưởng `status` suy runtime từ `result`/`disposition` như một view.** Không — nó là cột lưu
   thật; sửa `result`/`disposition` của một dòng đã ổn định (`WAITING_RETURN`/`COMPLETED`, hay
   `PASS` ngay từ lúc tạo) không có route nào cả, sẽ không tự cập nhật `status`. Chỉ `NOT_INSPECTED`
   (qua `POST /iqc/:iqcId/confirm`) và `PENDING` (qua `POST /iqc/:iqcId/resolve`) còn đổi được,
   mỗi trạng thái đúng một lần. `PATCH /iqc/:iqcId` **không** phải ngoại lệ — nó chỉ sửa 4 field
   ngữ cảnh (xem mục ngay trên "Lifecycle"), `UpdateIqcReqDto` không có field `result`/`disposition`
   để nhận.
2. **Tưởng có route đổi `WAITING_RETURN` → `COMPLETED`.** Chưa có — đó là việc của phase nối với
   `supplier_returns.post` sau này. Đừng nhầm với `PENDING → WAITING_RETURN`/`COMPLETED`, việc đó
   `POST /iqc/:iqcId/resolve` đã làm được.
3. **Đi tìm bảng con `iqc_items`.** Không có — bảng phẳng, 1 dòng = 1 lần kiểm 1 vật tư.
4. **Tưởng `POST /iqc/:iqcId/confirm` nhận `result` từ client.** Không — chỉ nhận
   `inspectionLevel`/`aqlLevel`/`sampleSize`/`defectQty`; `result` luôn do server tự tính từ Ac/Re
   tra được, không tin dữ liệu client gửi lên.

## Related docs

- `docs/domains/inventory.md` — `supplier_returns.iqcId`, nơi IQC `WAITING_RETURN` sẽ nối vào khi
  phase sau mở route tạo phiếu trả NCC thật.
- `docs/domains/purchasing.md` — `purchaseOrders` mà IQC trace tới.
- `docs/domains/partners.md` — `suppliers` mà IQC bắt buộc gắn vào.
