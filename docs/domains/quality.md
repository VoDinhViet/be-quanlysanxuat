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
COMPLETED` vào `supplier_returns.post` (xem "Cross-domain dependencies"); **phase 6** thêm
`DELETE :iqcId` (đường gỡ phiếu tạo nhầm, chỉ khi còn `NOT_INSPECTED`) đi cùng gate mới ở
`inventory-issues` (xem "Cross-domain dependencies").

**Đường tạo thứ hai, tự động:** `POST /inventory-receipts/:id/confirm` với `requiresIqc = true`
sinh một dòng `iqc_inspections` (`NOT_INSPECTED`) cho mỗi dòng phiếu nhập, qua
`IqcService.createInspectionsFromReceipt(tx, ...)` — chạy trong transaction của
`InventoryReceiptsService.confirmInventoryReceipt`, không phải một call riêng ngoài transaction như
`POST /iqc` tay. Các dòng sinh ra vẫn đi qua đúng vòng đời bên dưới — `confirm`/`PATCH` không phân
biệt dòng tạo tay hay tạo tự động.

**Đường tạo thứ ba, cũng tự động:** `POST /outsourcing-receipts` với `requiresIqc = true` sinh **N
dòng** (1/dòng phiếu OS-IN) qua `IqcService.createInspectionsFromOutsourcingReceipt(tx, ...)` —
**khác** đường thứ hai ở chỗ gọi ngay trong transaction `create` (không phải một bước `confirm`
riêng, `outsourcing_receipts` không có bước nháp/trạng thái `PENDING_IQC` nào — xem
`docs/decisions/outsourcing-no-draft.md`) và **không gate** việc tạo phiếu — hàng đã về nhà máy vật
lý trước khi IQC chạy, không phải "về kho" theo nghĩa `inventory_balances` (gia công ngoài không
ghi tồn, `docs/decisions/wip-not-stocked.md`). `outsourcingReceiptId` trên mỗi dòng IQC sinh ra là
chiều trace, tuỳ chọn, cùng
vai trò `inventoryReceiptId`/`purchaseOrderId` — trỏ về **header** OS-IN, không phân biệt được dòng
phiếu nào sinh ra nó (đủ cho mục đích trace, không cần chính xác tới từng dòng). Xem
`docs/domains/inventory.md`.

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
- **→ Inventory (Gate xuất kho sản xuất)**: `InventoryIssuesService.postInventoryIssue`
  (`issueType = PRODUCTION`) chặn (`E203`) nếu còn ≥1 phiếu IQC chưa `COMPLETED` của cùng
  `(itemId, warehouseId)` — `hasPendingIqcForItems` (`src/api/iqc/iqc.query.ts`, plain function,
  không DI). Suy kho qua `inventoryReceipt.warehouseId`; phiếu IQC tạo tay hoặc sinh từ OS-IN (không
  gắn `inventoryReceiptId`) không suy được kho thì bỏ qua, không chặn — xem
  `docs/decisions/qc-gates-on-stock-moves.md`.
- **↔ Inventory (Supplier Returns)**: `confirmIqc` tự sinh một dòng `supplier_returns` (DRAFT) khi
  `status` chuyển `WAITING_RETURN` (`SupplierReturnsService.createFromIqcDisposition`, cùng
  transaction). Chiều ngược lại, khi kho `post` phiếu trả đó,
  `completeIqcAfterSupplierReturn` (plain function, không qua DI — tránh vòng lặp module vì
  `IqcModule` đã import `SupplierReturnsModule`) hoàn tất dòng IQC. Xem
  `docs/workflows/supplier-return.md`.
- **← Inventory (Gia công ngoài)**: `POST /outsourcing-receipts` với `requiresIqc = true` là đường
  tạo tự động thứ ba (ngoài `POST /iqc` tay và `confirm` phiếu nhập) — xem "Đường tạo thứ ba" ở
  Purpose. `outsourcingReceiptId` là chiều trace tuỳ chọn trên dòng IQC sinh ra.
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
   đường thứ ba: `POST /outsourcing-receipts` (`requiresIqc = true`) — xem Purpose.
8. **Tưởng IQC không có route xoá.** Có từ phase 6 — `DELETE /iqc/:iqcId`, chỉ khi còn
   `NOT_INSPECTED` (`E206`) — đường gỡ đi kèm gate IQC mới ở `inventory-issues` (xem "Cross-domain
   dependencies"), không phải một route CRUD đầy đủ.

## OQC (Outgoing/Final QC)

Kiểm chất lượng **công đoạn** theo phương pháp AQL, trước khi cho nhập kho thành phẩm — bảng riêng
`oqc_inspections`, độc lập hoàn toàn với `iqc_inspections` ở trên. Khung phân vai: **IQC đảm nhiệm
QC vật tư** (hàng nhập từ NCC), **OQC đảm nhiệm QC công đoạn** (bước gia công/lắp ráp bên trong một
Job sản xuất). Đổi từ gắn theo cả Job sang gắn theo từng công đoạn (`production_job_operations`) —
xem `docs/decisions/oqc-per-operation.md`. Cùng gốc khái niệm AQL (`resolveAqlPlan()`, `AQL_LEVELS`,
`IqcInspectionLevel`, `IqcResult` — tái dùng thẳng, cùng pgEnum Postgres, không nhân đôi) nhưng
`OqcDisposition` (`ACCEPT`/`REWORK`/`SCRAP`) là enum **riêng**, không dùng `IqcDisposition`
(`CONCESSION`/`SORT`/`RETURN`) — OQC là QC nội bộ sản xuất, không có NCC để trả hàng.

### Core concepts

**Bảng phẳng, một dòng = một lô kiểm của một công đoạn.** `productionJobOperationId` liên kết tới
`production_job_operations` (nullable, `SET NULL` — một công đoạn có thể bị hard-delete cùng Job
khi LSX chứa nó được duyệt lại, `ProductionOrdersService.seedPlan`), bắt buộc ở service
(`CreateOqcReqDto`), không bắt buộc ở DB để dữ liệu cũ (gắn thẳng Job, trước đợt đổi model) sống
sót. `productionJobId` vẫn giữ, denormalize từ `operation.productionJobId`, server tự set — dùng để
lọc/join theo Job không phải qua `production_job_operations`, và là neo cho 2 gate cross-domain (xem
bên dưới). `operationCode`/`operationName`/`partCode`/`partName` là **snapshot bắt buộc** (NOT NULL)
lúc tạo — nguồn hiển thị chính khi `productionJobOperationId` về `null`, khuôn
`outsourcing_order_items`. `itemId` NOT NULL, snapshot từ `bomItem.itemId` của node BOM chứa công
đoạn — node mất `itemId` (`set null`, item gốc bị xoá) thì không tạo được OQC (`E199`).

**`quantity` là lot size QC tự nhập, không suy tự động.** Trần chặn không phải một số cố định mà là
tiến độ thật của chính công đoạn: `operation.completedQuantity` (xưởng tự báo qua
`PATCH /production-jobs/:jobId/operations/:operationId`) — xem "Điều kiện tạo" bên dưới.

**Bốn enum, hai quy tắc suy `status`:**

```
result       PASS | FAIL                        — nullable (chưa kiểm = NULL)
resultAuto   PASS | FAIL                        — server tự suy từ Ac/Re, nullable
disposition  ACCEPT | REWORK | SCRAP  — chỉ có nghĩa khi result = FAIL
status       NOT_INSPECTED | PENDING | REWORK | COMPLETED
```

- Tạo mới luôn `status = NOT_INSPECTED` — `POST /oqc` **không** nhận `result` vì luồng OQC luôn
  tách 2 bước: production "Yêu cầu QC" trước, QC "xác nhận" sau (xem "Trigger từ production" bên
  dưới).
- `resultAuto` server tự suy từ `defectQty` so `ac` của plan AQL (`resolveAqlResult()`) — `result`
  QC gửi lên **thắng** nếu có, vắng thì lấy `resultAuto`; lệch `resultAuto` mà không kèm `resultNote`
  bị chặn (`E201`) — ghi đè auto-suggest phải có lý do, có vết.
- `result = PASS` → `status = COMPLETED` — **khoá cứng**, không `confirm` lại được nữa (`E177`).
  Đây là điểm khác biệt lớn nhất với IQC (`COMPLETED` của IQC vẫn confirm lại được) — `COMPLETED`
  của OQC là mốc dùng để tính "Job đã QC xong hết" (xem Cross-domain dependencies), khoá lại để QC
  không thể âm thầm đổi kết quả sau khi kho/giao hàng đã dựa vào nó.
- `result = FAIL`, chưa gửi `disposition` → `status = PENDING` ("FAIL chờ xử lý").
- `result = FAIL`, `disposition = ACCEPT` (chấp nhận đặc biệt, dùng tiếp dù có lỗi) hoặc `SCRAP`
  (loại bỏ hẳn) → `status = COMPLETED` ngay — cả hai đều là điểm dừng.
- `result = FAIL`, `disposition = REWORK` (trả xưởng sửa lại) → `status = REWORK` — phiếu **vẫn
  mở**, QC kiểm lại trên chính phiếu đó tới khi PASS, khác `PENDING` chỉ ở tên gọi/ý nghĩa hiển thị,
  cùng cho `confirm` lại (chỉ `COMPLETED` mới khoá).
- `PASS` mà vẫn gửi `disposition` bị chặn (`E202`, khớp
  `chk_oqc_inspections_disposition_requires_fail`).

`OqcService.resolveOqcStatus` là nơi duy nhất áp quy tắc suy `status`. Không nhánh nào ghi ngược
`production_job_operations.completedQuantity` — kể cả `SCRAP` (giải phóng lại quota bằng cách không
tính vào Σ đã xin QC, không phải bằng cách trừ `completedQuantity`) — tránh race với thao tác tay
của xưởng, xem `docs/domains/production.md`.

### Trigger từ production — "Yêu cầu QC" (`GET /oqc/inspectable-operations`, `POST /oqc`)

`GET /oqc/inspectable-operations` là popup "chọn công đoạn cần QC" — copy khuôn
`OutsourcingOrdersService.getOutsourceableOperations`, khác: không lọc `type = OUTSOURCE` (OQC áp
cho mọi công đoạn, không riêng gia công ngoài), và mốc hiển thị là tiến độ QC
(`completedQuantity` so `inspectedQuantity`, không phải SL gửi gia công). Trả về
`productionJobOperationId` — id thật sự cần gửi lại khi tạo OQC.

`POST /oqc` nhận `productionJobOperationId!`, `quantity!` (lot size), `inspectionDate!`, `code?`,
`note?`. Thứ tự kiểm:

1. Công đoạn tồn tại (`E091`, tái dùng — cùng ngữ nghĩa `production-jobs`).
2. Job chứa công đoạn đó phải `IN_PROGRESS` (`E175`).
3. Node BOM chứa công đoạn còn `itemId` để snapshot `partCode`/`partName` (`E199`).
4. Σ `quantity` đã xin QC của **mọi công đoạn as-used cùng một node BOM** (không riêng công đoạn
   đang tạo — 1 node có thể có nhiều bước nhưng cùng 1 part vật lý), cộng lô mới, không vượt SL kế
   hoạch của chính node đó (`resolvePlannedQuantities`) — vượt thì `E176` (đổi mốc từ
   `production_jobs.quantity` cũ, giờ so ở cấp node vì OQC không còn 1:1 với Job).
5. Σ `quantity` đã xin QC của **riêng công đoạn này** (trừ dòng `disposition = SCRAP` — hàng đã
   loại bỏ hẳn, giải phóng lại quota), cộng lô mới, không vượt `operation.completedQuantity` hiện
   tại — vượt thì `E198`. QC không được xin kiểm nhiều hơn phần xưởng đã báo hoàn thành.

`GET /production-jobs/:jobId/bom` kèm tóm tắt OQC (`inspectedQuantity`/`remainingQuantity`/
`openCount`) cho mỗi công đoạn — đọc một chiều qua `getOqcSummaryByJobOperationIds`
(`src/api/oqc/oqc.query.ts`, plain function, không qua DI) — `ProductionJobsModule` **không** import
`OqcModule`, bất biến "Production không biết OQC tồn tại" vẫn giữ (chỉ nới ở chiều đọc hiển thị).

### AQL auto-suggest (`GET /oqc/aql-plan`)

Route mới, trả `{codeLetter, sampleSize, ac, re}` tra từ `resolveAqlPlan()` theo `quantity`
(lot size)/`inspectionLevel`/`aqlLevel` — tra hụt (bảng `SAMPLING_PLAN` chưa phủ hết mọi tổ hợp)
trả `E200`. FE gọi route này để gợi ý `sampleSize` trước khi QC nhập `defectQty`.

⚠️ Bảng `SAMPLING_PLAN` (`src/api/iqc/iqc-aql.constant.ts`) do Claude tự điền lại từ kiến thức
chuẩn ANSI/ASQ Z1.4 (không tra trực tiếp bản giấy gốc) — **bắt buộc QC/kỹ thuật đối chiếu từng ô**
với bảng chính thức và ký duyệt trước khi coi là số liệu go-live. Dùng chung với IQC (không nhân
đôi bảng), nhưng chỉ OQC dùng để **auto-suy `result`** — IQC vẫn giữ hành vi cũ (QC tự chọn `result`
hoàn toàn, bảng AQL chỉ tính `ac`/`re` tham khảo). Hai module cố tình lệch nhau ở điểm này, đừng
"đồng bộ hoá" nhầm sau này.

### Lưu kết quả OQC (`POST /oqc/:oqcId/confirm`)

1. Chặn nếu đã `COMPLETED` (`E177`) — mọi status khác (`NOT_INSPECTED`/`PENDING`/`REWORK`) confirm
   lại được nhiều lần, ghi đè toàn bộ mỗi lần gọi (field vắng mặt = xoá).
2. Nhận `inspectionLevel!`/`aqlLevel!`/`defectQty!` bắt buộc; `sampleSize?`/`result?` giờ **tuỳ
   chọn** — vắng thì server tự điền (`sampleSize` từ plan AQL, `result` từ `resultAuto`); cả
   `result` lẫn `resultAuto` đều vắng (không tra được plan, QC cũng không tự chọn) → `E200`.
3. `disposition?`/`dispositionNote?` — chỉ hợp lệ khi `result` cuối cùng = FAIL (`E202` nếu PASS mà
   vẫn gửi).
4. `confirmedBy`/`confirmedAt` chỉ ghi ở lần lưu đầu tiên. `resolvedBy`/`resolvedAt` chỉ ghi khi
   `disposition` **mới xuất hiện** lần đầu — cùng khuôn IQC.

### Xoá phiếu (`DELETE /oqc/:oqcId`)

Chỉ hợp lệ khi `status = NOT_INSPECTED` ("chưa kiểm", trước khi QC lưu kết quả lần đầu) — ngược
lại `E178`. Hard delete, không soft-delete (bảng không có `deletedAt`, không có bảng con nào phải
dọn kèm). `REWORK` **không** xoá được (đã từng confirm) — chỉ tiếp tục sửa qua `confirm`, không có
đường xoá riêng cho nhánh rework.

### Business rules

- `code` bất biến, unique, tự sinh `OQC-{năm}-{đếm trong năm + 1, pad 5}` nếu không gửi — cùng
  khuôn `IQC-*`/`PNK-*`/`PXK-*`/`PTNCC-*`. Cho phép client gửi `code` ghi đè.
- Không có file đính kèm bằng chứng đợt này — khác IQC (`iqc_attachments`), có thể mở rộng sau theo
  đúng khuôn `replaceAttachments`/discriminator `kind` nếu cần.
- "PO" hiển thị trên màn OQC = `orders.code` — tính lúc đọc bằng join
  `production_jobs → production_orders → orders`, **không lưu cột**.
- Công đoạn Cấp 0 của chính FG (`routings`/`routing_operations`) vẫn không có nơi để QC riêng —
  không tạo bảng mới cho tầng đó (quyết định đã chốt, xem
  `docs/decisions/oqc-per-operation.md`); gate nhập kho TP (`E196`) là thứ gần nhất thay thế được.

### Cross-domain dependencies

- **← Production**: `productionJobOperationId` bắt buộc trỏ tới một công đoạn của Job `IN_PROGRESS`
  lúc tạo — đọc một chiều. `GET /production-jobs/:jobId/bom` đọc ngược tóm tắt OQC để hiển thị,
  nhưng vẫn qua plain function, không import module — Production không biết OQC tồn tại theo nghĩa
  dependency injection.
- **→ Inventory (Gate nhập kho TP)**: `POST /inventory-receipts/:id/confirm` với
  `receiptType = PRODUCTION` chặn nếu Job chưa có phiếu OQC nào hoặc còn phiếu nào chưa `COMPLETED`
  (`E196`) — `getJobOqcClearance` (`src/api/oqc/oqc.query.ts`, plain function, không DI). SL nhập
  (cộng dồn mọi phiếu PRODUCTION khác cùng Job) vẫn chặn trần theo `production_jobs.quantity`
  (`E197`, không còn so với SL OQC PASS như thiết kế cũ — xem
  `docs/decisions/oqc-per-operation.md`). Xem `docs/domains/inventory.md`.
- **→ Inventory (Gate giao hàng)**: `POST /outbound-orders/:id/confirm` (`DRAFT →
  PENDING_DELIVERY`) chặn (`E205`) nếu còn Job nào (suy từ `outbound_order_items.productionJobId`)
  chưa qua hết OQC — tái dùng nguyên `getJobOqcClearance`. Xem `docs/domains/inventory.md`.

## Related docs

- `docs/domains/inventory.md` — `supplier_returns`, nơi IQC `WAITING_RETURN` nối vào; gate xuất kho
  sản xuất theo IQC; gate nhập kho TP + gate giao hàng theo OQC.
- `docs/domains/production.md` — `production_jobs`/`production_job_operations`, nơi OQC gắn vào.
- `docs/workflows/final-qc.md` — luồng đầy đủ OQC: "Yêu cầu QC" từ production → confirm (auto-suggest
  + rework) → 2 gate nhập kho/giao hàng.
- `docs/workflows/stock-movement.md` — gate IQC chặn xuất kho sản xuất.
- `docs/workflows/supplier-return.md` — luồng đầy đủ từ disposition tới hoàn tất IQC.
- `docs/workflows/outsourcing-round-trip.md` — luồng OS-OUT → OS-IN → QC tuỳ chọn (đường tạo thứ
  ba vào bảng này).
- `docs/decisions/oqc-per-operation.md` — vì sao OQC đổi từ gắn Job sang gắn công đoạn.
- `docs/decisions/qc-gates-on-stock-moves.md` — vì sao thêm gate IQC/OQC vào luồng xuất/nhập kho.
- `docs/domains/purchasing.md` — `purchaseOrders` mà IQC trace tới.
- `docs/domains/partners.md` — `suppliers` mà IQC bắt buộc gắn vào.
