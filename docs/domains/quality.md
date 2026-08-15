# Quality (Kiểm tra chất lượng)

## Purpose

Ghi nhận kết quả kiểm tra chất lượng hàng nhập (IQC — Incoming Quality Control): một vật tư từ một
NCC đạt hay không đạt, và nếu không đạt thì xử lý thế nào. Phase 1 chỉ có `GET` list + `GET stats` +
`POST` tạo; phase 2 thêm `GET :iqcId` (chi tiết) và `POST :iqcId/confirm` (xác nhận PASS/FAIL cho
dòng chưa kiểm, AQL sampling chỉ để gợi ý); phase 3 thêm `POST :iqcId/resolve` (chọn phương án xử
lý cho dòng FAIL đang chờ xử lý) — **route này đã bị xoá ở phase 5**, gộp vào `confirm`; phase 4
thêm `PATCH :iqcId` (sửa lại 4 field ngữ cảnh — không đụng PASS/FAIL); **phase 5** làm lại
`confirm` thành nút "Lưu" duy nhất của trang chi tiết (QC tự chọn `result`, gộp cả phần chọn
`disposition`, thêm ghi chú/SL OK-NG/bộ phận QC/2 bộ file đính kèm), và nối `WAITING_RETURN →
COMPLETED` vào `supplier_returns.post` (xem "Cross-domain dependencies").

**Đường tạo thứ hai, tự động:** `POST /inventory-receipts/:id/confirm` với `requiresIqc = true`
sinh một dòng `iqc_inspections` (`NOT_INSPECTED`) cho mỗi dòng phiếu nhập, qua
`IqcService.createInspectionsFromReceipt(tx, ...)` — chạy trong transaction của
`InventoryReceiptsService.confirmInventoryReceipt`, không phải một call riêng ngoài transaction như
`POST /iqc` tay. Các dòng sinh ra vẫn đi qua đúng vòng đời bên dưới — `confirm`/`PATCH` không phân
biệt dòng tạo tay hay tạo tự động.

**Đường tạo thứ ba, cũng tự động:** `POST /outsourcing-receipts/:id/post` với `requiresIqc = true`
sinh 1 dòng tương tự qua `IqcService.createInspectionFromOutsourcingReceipt(tx, ...)` — **khác**
đường thứ hai ở chỗ gọi lúc `post` (không phải một bước `confirm` riêng, `outsourcing_receipts`
không có trạng thái `PENDING_IQC`) và **không gate** việc `post` — hàng đã về kho vật lý trước khi
IQC chạy. `outsourcingReceiptId` trên dòng IQC sinh ra là chiều trace, tuỳ chọn, cùng vai trò
`inventoryReceiptId`/`purchaseOrderId`. Xem `docs/domains/inventory.md`.

Ba đường tạo trên (`POST /iqc` tay + 2 đường tự động) là toàn bộ cách một dòng `iqc_inspections`
ra đời.

**Đây không phải toàn bộ domain Quality.** File này còn phủ **OQC (Outgoing/Final QC)** — kiểm chất
lượng lô thành phẩm trước khi cho nhập kho, bảng riêng `oqc_inspections`, độc lập hoàn toàn với IQC
(khác vật tư đang kiểm: hàng nhập từ NCC vs. thành phẩm từ Job sản xuất; khác vòng đời: không có
`disposition`/NCR). Xem mục "OQC (Outgoing/Final QC)" bên dưới.

## Core concepts (IQC)

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

- Tạo mới không gửi `result` → `status = NOT_INSPECTED` ("Chưa kiểm") — dòng tồn tại nhưng chưa có
  kết quả. Đây là `status` duy nhất còn đổi lại được nhiều lần sau đó, qua `POST /iqc/:iqcId/confirm`
  (xem mục "Lưu kết quả QC" bên dưới) — **trừ** khi đã `WAITING_RETURN` (đã chốt đường trả NCC).
- `result = PASS` → `status = COMPLETED` ngay, `disposition` phải để trống (`E139` nếu gửi kèm).
- `result = FAIL`, chưa gửi `disposition` → `status = PENDING` ("Chờ xử lý").
- `result = FAIL`, `disposition = CONCESSION` (chấp nhận đặc biệt — không cần trả hàng) →
  `status = COMPLETED` ngay.
- `result = FAIL`, `disposition = SORT` (phân loại, tách SL OK/NG) hoặc `RETURN` (trả cả lô) — cả
  hai đều cần xuất hàng NG ra khỏi kho → `status = WAITING_RETURN` ("Chờ trả NCC"), **và** cùng lúc
  tự sinh một dòng `supplier_returns` (DRAFT) cho phần hàng NG (xem "Cross-domain dependencies").

`IqcService.resolveIqcStatus` là nơi duy nhất áp quy tắc này — dùng chung cho cả `POST /iqc` (khi
gửi `result` ngay lúc tạo) lẫn `POST /iqc/:iqcId/confirm`; `chk_iqc_inspections_disposition_
requires_fail` ở DB là chốt chặn cuối, không phải nơi tính `status`.

## Lưu kết quả QC (`POST /iqc/:iqcId/confirm`)

Nút "Lưu" **duy nhất** của trang chi tiết IQC — ghi đè toàn bộ quyết định QC mỗi lần gọi (field
vắng mặt trong payload nghĩa là xoá, không phải giữ nguyên), gọi lại được **nhiều lần** trừ khi
dòng đã `WAITING_RETURN` (`E159` — đường trả NCC đã chốt, không cho đổi kết quả nữa). Route
`POST /iqc/:iqcId/resolve` cũ đã gộp hẳn vào đây — 1 nút Lưu không thể trung thực điều khiển 2
endpoint dùng-1-lần riêng biệt.

1. **QC tự chọn `result` (PASS/FAIL) — server không suy từ AQL nữa.** `inspectionLevel`/`aqlLevel`
   vẫn gửi lên và `IqcService.getIqc` vẫn tính `ac`/`re` tham khảo qua `resolveAqlPlan()`
   (`src/api/iqc/iqc-aql.constant.ts`) để FE hiện khối "gợi ý", nhưng tra hụt (bảng `SAMPLING_PLAN`
   còn thiếu nhiều tổ hợp) **không còn chặn được `confirm`** — khác thiết kế phase 2 cũ.
2. `disposition` chỉ hợp lệ khi `result = FAIL` (`E139`, khớp `chk_iqc_inspections_disposition_
   requires_fail`). Khi `disposition = SORT`, bắt buộc gửi kèm `sortOkQty`/`sortNgQty` (`E162` nếu
   thiếu) và phải cộng đúng `quantity` của dòng IQC (`E160`, so bằng số nguyên đã scale — cả 3 đều
   `numeric`); gửi 2 field này khi `disposition` khác `SORT` là `E161`.
3. Ghi thêm: `resultNote`/`dispositionNote` (ghi chú, 2 mốc khác nhau — có thể ghi ở 2 lần lưu khác
   nhau), `qcDepartmentId` (bộ phận QC đã kiểm — FK `departments`, không phải text tự do), và 2 bộ
   file đính kèm độc lập `qcEvidenceFileIds`/`dispositionEvidenceFileIds` (bằng chứng kiểm tra vs.
   bằng chứng quyết định xử lý — xem "Bằng chứng đính kèm" bên dưới).
4. `confirmedBy`/`confirmedAt` chỉ ghi ở lần lưu **đầu tiên** (mốc nghiệp vụ "đã có kết quả") — sửa
   lại kết quả ở lần lưu sau không ghi đè, `updatedAt` đã ghi lại việc sửa. Tương tự,
   `resolvedBy`/`resolvedAt` chỉ ghi khi `disposition` **mới xuất hiện** lần đầu.
5. **Lật `result` từ FAIL về PASS trong cùng 1 lần lưu** ép null toàn bộ nhóm
   `disposition`/`sortOkQty`/`sortNgQty`/`dispositionNote` và xoá sạch bộ `DISPOSITION_EVIDENCE` —
   một `UPDATE` duy nhất nên CHECK chỉ đánh giá ở cuối câu lệnh, không bao giờ ở trạng thái vi phạm
   tạm thời.
6. 4 field ngữ cảnh cũ vẫn còn nguyên: `inspectionStandard`/`inspectorName`/`measuringTools`/
   `inspectionDate` — `inspectorName` là text tự do, **tách biệt** với `confirmedBy` (tài khoản
   bấm nút "Lưu"): người kiểm thật ngoài xưởng có thể không có tài khoản trong hệ thống.
7. Khi `status` tính ra `WAITING_RETURN`, `confirmIqc` gọi
   `SupplierReturnsService.createFromIqcDisposition` **cùng transaction** — xem "Cross-domain
   dependencies". Vì `WAITING_RETURN` khoá mọi lần confirm sau đó, đây là lần **duy nhất** một dòng
   IQC chuyển sang trạng thái này, nên không cần guard chống tạo phiếu trả trùng.

⚠️ Bảng `SAMPLING_PLAN` (Ac/Re theo từng code letter × AQL) hiện chỉ điền một phần dữ liệu mẫu —
giờ chỉ ảnh hưởng độ chính xác của khối gợi ý hiển thị, không còn ảnh hưởng khả năng lưu kết quả.

## Bằng chứng đính kèm

`iqc_attachments` — 1 bảng, discriminator `kind` (`QC_EVIDENCE`/`DISPOSITION_EVIDENCE`), thay vì 2
bảng gần như y hệt nhau (`order_attachments`/`supplier_attachments` đã là 2 bản trùng lặp — không
nhân thêm bản thứ 3/4). Mỗi bộ replace-all độc lập theo `(iqcId, kind)` —
`IqcService.replaceAttachments`. `UploadType.IQC_EVIDENCE`/`IQC_DISPOSITION_EVIDENCE` đều map sang
`FileKind.EVIDENCE` (ảnh ∪ tài liệu, cap theo `upload.maxDocumentSize`) — bằng chứng QC vừa có ảnh
chụp thực tế vừa có tài liệu đo lường (PDF), không thuộc gọn một trong hai kind cũ.

## Sửa thông tin ngữ cảnh sau confirm (`PATCH /iqc/:iqcId`)

Chỉ sửa được 4 field ngữ cảnh — `inspectionStandard`/`inspectorName`/`measuringTools`/
`inspectionDate` — **không** đụng tới `inspectionLevel`/`aqlLevel`/`sampleSize`/`defectQty`/
`result`/`disposition`: những field đó giờ sửa lại được thẳng qua `POST /iqc/:iqcId/confirm` (trừ
khi đã `WAITING_RETURN`), route PATCH này chỉ còn ý nghĩa cho dòng **đã** `WAITING_RETURN` — nơi
`confirm` bị khoá nhưng người dùng vẫn cần sửa lỗi chính tả `inspectorName` chẳng hạn.

1. Chỉ hợp lệ khi `status !== NOT_INSPECTED` — dòng phải có kết quả trước đã mới có thông tin ngữ
   cảnh để sửa, ngược lại `E144` (409). Hợp lệ ở **mọi** status khác, kể cả `WAITING_RETURN`.
2. Ngữ nghĩa PATCH chuẩn: thiếu key = giữ nguyên, gửi `null` tường minh mới xoá (3 field text).
   `inspectionDate` không nullable (cột `NOT NULL`) nên không có ca "xoá" — chỉ có "đổi ngày" hoặc
   "không gửi = giữ nguyên".
3. Không ghi actor/timestamp riêng cho hành động sửa này (khác `confirmedBy`/`resolvedBy`) — đây
   chỉ là sửa lỗi nhập liệu, không phải một mốc nghiệp vụ mới cần trace.

## Lifecycle

`status` set lúc `POST /iqc`, đổi lại được nhiều lần qua `POST /iqc/:iqcId/confirm` cho tới khi
chạm `WAITING_RETURN` (khoá cứng — `E159`). Từ đó, `status` chỉ còn đổi được đúng một lần nữa,
**không** qua `IqcService` mà qua `completeIqcAfterSupplierReturn` (`src/api/iqc/iqc.write.ts`) —
gọi bởi `SupplierReturnsService.postSupplierReturn` khi kho xác nhận đã thật sự xuất hàng trả NCC,
`WAITING_RETURN → COMPLETED`. Đây là transition duy nhất không đi qua `resolveIqcStatus`.

## Business rules

- `code` bất biến, unique toàn bảng, tự sinh `IQC-{năm}-{đếm trong năm + 1, pad 5}` nếu không gửi
  — cùng khuôn `PNK`/`PXK`/`PTNCC` (`docs/domains/inventory.md`).
- `disposition` chỉ hợp lệ khi `result = FAIL` — validate ở service (`E139`) trước, DB CHECK
  (`chk_iqc_inspections_disposition_requires_fail`) là lớp phòng thủ thứ hai.
- `sortOkQty`/`sortNgQty` luôn cùng NULL hay cùng có giá trị (`chk_iqc_inspections_sort_qty_pair`),
  chỉ hợp lệ khi `disposition = SORT` (`chk_iqc_inspections_sort_qty_requires_sort`), và cộng lại
  đúng `quantity` (`chk_iqc_inspections_sort_qty_total`, so `numeric` chính xác tuyệt đối).
- `inventoryReceiptId`/`purchaseOrderId`/`outsourcingReceiptId` không bắt buộc — hàng kiểm ngoài
  luồng PO (ví dụ NCC giao tay) vẫn tạo được IQC, dùng `reason` (text tự do) thay cho PO trên màn
  hiển thị "PO / Lý do". Nhưng nếu `disposition` ra `SORT`/`RETURN` mà không suy được kho trả (kiểm
  lần lượt `inventoryReceipt.warehouseId` → `outsourcingReceipt.warehouseId` →
  `purchaseOrder.receiptWarehouseId`, không nguồn nào có → `E163`, chặn `confirm`). Một dòng IQC
  thực tế chỉ có tối đa một trong ba FK trace này khác `null`.
- `inspectionLevel`/`aqlLevel`/`sampleSize`/`defectQty`/`inspectionStandard`/`inspectorName`/
  `measuringTools`/`confirmedBy`/`confirmedAt` đều nullable — chỉ có giá trị sau khi
  `POST /iqc/:iqcId/confirm` lưu lần đầu; trước đó (`NOT_INSPECTED`) là `NULL`.
- `resolvedBy`/`resolvedAt` cũng nullable — chỉ có giá trị khi dòng FAIL đã được chọn phương án xử
  lý; tách biệt với `confirmedBy`/`confirmedAt`.
- `inspectionDate` là `timestamp` (có giờ) — set lúc tạo, sửa lại được qua confirm hoặc PATCH.

## Invariants

- Không có FK mức dòng tới `purchase_order_items`/`inventory_receipt_items` — `purchase_order_
  items` không có số thứ tự dòng nên không tái tạo được kiểu hiển thị `PO2406001-01`; PO/NK trên
  IQC chỉ trace tới mức chứng từ.
- `itemId` không bị ràng buộc `type = RM` ở DB/service (giống mọi chỗ khác dùng `items` — xem
  `docs/domains/product-structure.md`), dù nghiệp vụ thực tế IQC luôn là vật tư nhập.
- CHECK `sample_size > 0` / `defect_qty >= 0` / `aql_level` giới hạn trong tập giá trị chuẩn
  (0.65/1.0/1.5/2.5/4.0/6.5) khi các cột này có giá trị — chốt chặn cuối, không phải nơi tính plan
  AQL (đó là `resolveAqlPlan()`, giờ chỉ mang tính tham khảo, không quyết định `result`).

## Cross-domain dependencies

- **← Inventory**: `POST /inventory-receipts/:id/confirm` (`requiresIqc = true`) là nơi duy nhất
  ngoài `POST /iqc` ghi vào `iqc_inspections` — xem "Đường tạo thứ hai" ở Purpose.
- **→ Inventory**: `POST /inventory-receipts/:id/post` chặn (`E153`) khi phiếu đang `PENDING_IQC`
  mà còn phiếu IQC nào của nó chưa `COMPLETED` (kể cả khi chưa có phiếu IQC nào) — cổng chất lượng
  nằm ở phía `inventory-receipts`, domain này không tự đẩy trạng thái phiếu nhập.
- **↔ Inventory (Supplier Returns)**: `confirmIqc` tự sinh một dòng `supplier_returns` (DRAFT) khi
  `status` chuyển `WAITING_RETURN` (`SupplierReturnsService.createFromIqcDisposition`, cùng
  transaction). Chiều ngược lại, khi kho `post` phiếu trả đó,
  `completeIqcAfterSupplierReturn` (plain function, không qua DI — tránh vòng lặp module vì
  `IqcModule` đã import `SupplierReturnsModule`) hoàn tất dòng IQC. Xem
  `docs/workflows/supplier-return.md`.
- **← Inventory (Gia công ngoài)**: `POST /outsourcing-receipts/:id/post` với `requiresIqc = true`
  là đường tạo tự động thứ ba (ngoài `POST /iqc` tay và `confirm` phiếu nhập) — xem "Đường tạo thứ
  ba" ở Purpose. `outsourcingReceiptId` là chiều trace tuỳ chọn trên dòng IQC sinh ra.
- **→ Purchasing**: `purchaseOrderId` liên kết tuỳ chọn tới PO — thuần để trace, không đọc ngược.
- **→ Partners**: `supplierId` bắt buộc tới `suppliers`.
- **→ Product Structure**: `itemId` bắt buộc tới `items`.
- **→ Identity/Access**: `qcDepartmentId` liên kết tuỳ chọn tới `departments`.
- **→ Files**: `iqc_attachments.fileId` tới `files` — xem "Bằng chứng đính kèm" ở trên.

## Common mistakes

1. **Tưởng `status` suy runtime từ `result`/`disposition` như một view.** Không — nó là cột lưu
   thật. `NOT_INSPECTED`/`PENDING` còn đổi lại được nhiều lần qua `confirm`; `WAITING_RETURN` thì
   khoá cứng, chỉ `completeIqcAfterSupplierReturn` đổi tiếp được (đúng một lần).
2. **Tưởng có route `POST /iqc/:iqcId/resolve` riêng để chọn `disposition`.** Đã xoá — gộp vào
   `confirm` từ phase 5.
3. **Đi tìm bảng con `iqc_items`.** Không có — bảng phẳng, 1 dòng = 1 lần kiểm 1 vật tư.
4. **Tưởng `POST /iqc/:iqcId/confirm` tự tính `result` từ Ac/Re, không nhận từ client.** Sai từ
   phase 5 — QC tự chọn `result`; bảng AQL chỉ còn tính `ac`/`re` tham khảo ở `getIqc`.
5. **Tưởng có route `POST /iqc` khác để tạo hàng loạt.** Không — hàng loạt chỉ sinh từ
   `IqcService.createInspectionsFromReceipt` (nội bộ, gọi từ `inventory-receipts`), dùng
   `generateIqcCodes` (số nhiều, cấp N mã liên tiếp trong một lần đếm) chứ không lặp gọi
   `generateIqcCode` (số ít) N lần — gọi lặp trong cùng transaction chưa commit sẽ sinh N mã trùng
   nhau vì `COUNT(*)` không thấy các dòng vừa insert nhưng chưa commit của chính vòng lặp đó.
6. **Tưởng `WAITING_RETURN → COMPLETED` chưa có route.** Có từ phase 5 —
   `SupplierReturnsService.postSupplierReturn` gọi `completeIqcAfterSupplierReturn` khi kho xác
   nhận xuất trả. Đừng nhầm hàm này với `resolveIqcStatus`/`confirmIqc` — nó là một transition
   riêng, không đi qua `IqcService`.
7. **Tưởng chỉ có 2 đường tạo (`POST /iqc` tay + phiếu nhập mua).** Từ khi có gia công ngoài, còn
   đường thứ ba: `POST /outsourcing-receipts/:id/post` (`requiresIqc = true`) — xem Purpose.

## OQC (Outgoing/Final QC)

Kiểm chất lượng **lô thành phẩm** theo phương pháp AQL trước khi cho nhập kho — bảng riêng
`oqc_inspections`, độc lập hoàn toàn với `iqc_inspections` ở trên. Cùng gốc khái niệm AQL
(`resolveAqlPlan()`, `AQL_LEVELS`, `IqcInspectionLevel`, `IqcResult` — tái dùng thẳng, cùng pgEnum
Postgres, không nhân đôi) nhưng **không có `disposition`/NCR** — hàng FAIL không tách nhánh trả
NCC/sort/chấp nhận đặc biệt như IQC, xử lý FAIL đơn giản hơn nhiều (xem "Lưu kết quả OQC" dưới đây).
Quyết định hoãn NCR cho OQC là tường minh, không phải thiếu sót.

### Core concepts

**Bảng phẳng, một dòng = một lô kiểm của một Job.** `productionJobId` liên kết tới `production_jobs`
(nullable, `SET NULL` — một Job có thể bị hard-delete khi LSX chứa nó được duyệt lại,
`ProductionOrdersService.seedPlan`, cùng rủi ro đã chấp nhận ở `outsourcing_orders`,
`docs/domains/production.md`). `itemId` **NOT NULL**, snapshot từ `job.itemId` lúc tạo — sống sót
qua việc Job biến mất vì `items` chỉ xoá mềm, không hard-delete (khác `productionJobId`).

**`quantity` là lot size QC tự nhập, không suy tự động.** `production_jobs` không lưu sản lượng
thực tế (`producedQty`/`rejectedQty` đã từng có rồi bị xoá,
`docs/domains/production.md`) — không có nguồn nào để OQC tự tính lô đang kiểm là bao nhiêu, QC
luôn phải nhập tay.

**Hai enum, một quy tắc suy `status`** (đơn giản hơn IQC — không có `disposition`):

```
result   PASS | FAIL                       — nullable (chưa kiểm = NULL)
status   NOT_INSPECTED | PENDING | COMPLETED
```

- Tạo mới luôn `status = NOT_INSPECTED` — `POST /oqc` **không** nhận `result` (khác `POST /iqc`,
  vốn cho gửi `result` ngay lúc tạo) vì luồng OQC luôn tách 2 bước: production "yêu cầu QC" trước,
  QC "xác nhận" sau.
- `result = PASS` → `status = COMPLETED` — **khoá cứng**, không `confirm` lại được nữa (`E177`).
  Đây là điểm khác biệt lớn nhất với IQC (`COMPLETED` của IQC vẫn confirm lại được) — `COMPLETED`
  của OQC là mốc "đã dùng để mở khoá nhập kho TP" (xem Cross-domain dependencies), khoá lại để QC
  không thể âm thầm đổi kết quả sau khi kho đã nhập hàng dựa vào nó.
- `result = FAIL` → `status = PENDING` ("FAIL chờ xử lý") — QC sửa mẫu/kết quả rồi gọi lại
  `POST /oqc/:oqcId/confirm` trên **chính phiếu đó**, lặp lại tới khi PASS. Không có
  `disposition`/NCR tách nhánh.

`resolveOqcStatus` (pure, private trong `OqcService`) là nơi duy nhất áp quy tắc này — khuôn rút
gọn của `IqcService.resolveIqcStatus`.

### Lưu kết quả OQC (`POST /oqc/:oqcId/confirm`)

1. Chặn nếu đã `COMPLETED` (`E177`) — mọi status khác (`NOT_INSPECTED`/`PENDING`) confirm lại được
   nhiều lần, ghi đè toàn bộ mỗi lần gọi (field vắng mặt = xoá, cùng ngữ nghĩa `confirmIqc`).
2. Nhận `inspectionLevel`/`aqlLevel`/`sampleSize`/`defectQty`/`result`/`resultNote?` — QC tự chọn
   `result`, không suy từ Ac/Re (`GET /oqc/:oqcId` vẫn tính `ac`/`re` tham khảo qua
   `resolveAqlPlan()`, cùng hạn chế `SAMPLING_PLAN` chưa điền hết như IQC).
3. `confirmedBy`/`confirmedAt` chỉ ghi ở lần lưu đầu tiên — sửa lại kết quả (từ `PENDING` gọi lại)
   không ghi đè mốc này, `updatedAt` đã ghi lại việc sửa.

### Điều kiện tạo (`POST /oqc`)

Nhận `productionJobId!`, `quantity!` (lot size), `inspectionDate!`, `code?`, `note?`. Server tự suy
`itemId = job.itemId`.

1. Job phải `IN_PROGRESS` (`E175`) — Job không tồn tại dùng lại `E082`
   (`production_job.error.not_found`, cùng ngữ nghĩa `production-jobs`, không mint mã mới).
2. Tổng `quantity` mọi OQC **chưa xoá** (mọi `status`, kể cả `NOT_INSPECTED`/`PENDING` đang giữ
   chỗ — không chỉ `COMPLETED`) của cùng `productionJobId`, cộng lô mới, không được vượt
   `production_jobs.quantity` (SL kế hoạch) — vượt thì `E176`. Cho phép kiểm nhiều lần từng phần
   (partial) cộng dồn tới đủ SL kế hoạch.

### Xoá phiếu (`DELETE /oqc/:oqcId`)

Chỉ hợp lệ khi `status = NOT_INSPECTED` ("chưa kiểm", trước khi QC lưu kết quả lần đầu) — ngược
lại `E178`. Hard delete, không soft-delete (bảng không có `deletedAt`, không có bảng con nào phải
dọn kèm — khác IQC không có route xoá vì luôn phải giữ vết `disposition`/`supplier_returns`).

### Business rules

- `code` bất biến, unique, tự sinh `OQC-{năm}-{đếm trong năm + 1, pad 5}` nếu không gửi — cùng
  khuôn `IQC-*`/`PNK-*`/`PXK-*`/`PTNCC-*`. Cho phép client gửi `code` ghi đè (khuôn `CreateIqcReqDto`
  — cùng họ `quality`, khác quy ước `outsourcing` không nhận `code` từ client).
- Không có file đính kèm bằng chứng đợt này — khác IQC (`iqc_attachments`), có thể mở rộng sau theo
  đúng khuôn `replaceAttachments`/discriminator `kind` nếu cần.
- "PO" hiển thị trên màn OQC = `orders.code` (tên hiển thị chính thức trong repo, xem
  `ProductionJobResDto.orderCode`, description `'Mã đơn hàng (PO)'`) — tính lúc đọc bằng join
  `production_jobs → production_orders → orders`, **không lưu cột** (LSX/đơn hàng đổi tên sau vẫn
  hiển thị đúng).

### Cross-domain dependencies

- **← Production**: `productionJobId` bắt buộc trỏ tới một Job `IN_PROGRESS` lúc tạo — đọc một
  chiều, Production không biết gì về OQC (cùng khuôn `outsourcing_orders`,
  `docs/domains/production.md`).
- **→ Inventory**: `POST /inventory-receipts/:id/confirm` với `receiptType = PRODUCTION` chặn
  (`E180`) nếu tổng SL các dòng phiếu (cộng dồn mọi phiếu PRODUCTION khác cùng Job, trừ chính
  phiếu này) vượt tổng `quantity` các OQC `COMPLETED` (PASS) của Job đó —
  `getPassedOqcQuantityByJobId` (`src/api/oqc/oqc.query.ts`, plain function, không DI). Đây là chốt
  chặn nhập kho thành phẩm duy nhất trong hệ thống theo kết quả QC — xem
  `docs/domains/inventory.md`.

## Related docs

- `docs/domains/inventory.md` — `supplier_returns`, nơi IQC `WAITING_RETURN` nối vào; gate nhập kho
  TP theo OQC PASS.
- `docs/domains/production.md` — `production_jobs`, nơi OQC trace tới.
- `docs/workflows/final-qc.md` — luồng đầy đủ OQC: tạo → confirm (PASS/FAIL lặp lại) → nhập kho TP.
- `docs/workflows/supplier-return.md` — luồng đầy đủ từ disposition tới hoàn tất IQC.
- `docs/workflows/outsourcing-round-trip.md` — luồng OS-OUT → OS-IN → QC tuỳ chọn (đường tạo thứ
  ba vào bảng này).
- `docs/domains/purchasing.md` — `purchaseOrders` mà IQC trace tới.
- `docs/domains/partners.md` — `suppliers` mà IQC bắt buộc gắn vào.
