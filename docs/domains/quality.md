# Quality (Kiểm tra chất lượng)

## Purpose

Ghi nhận kết quả kiểm tra chất lượng: **IQC** (Incoming Quality Control — hàng nhập từ NCC đạt hay
không đạt, xử lý thế nào nếu không đạt) và **OQC** (Outgoing/Final QC — công đoạn sản xuất bên
trong một Job đạt hay không đạt). Hai module `iqc`/`oqc` tách biệt ở tầng API (route/DTO/ErrorCode
riêng), nhưng từ `docs/decisions/qc-single-table.md` cùng đọc/ghi **một bảng request**
`qc_requests`, phân biệt bằng cột `kind` (`INCOMING`/`OUTGOING`) — đọc quyết định đó trước
khi sửa bất kỳ gate hay query nào ở domain này, nó giải thích vì sao một số cột (`supplierId`,
`productionJobOperationId`, ...) chỉ có ý nghĩa với một `kind`.

**Mỗi request có 0..N lần kiểm (attempt), lưu ở bảng con `qc_inspections`.** Mỗi lần bấm nút "Lưu"
(`POST /iqc/:iqcId/confirm`/`POST /oqc/:oqcId/confirm`) **luôn insert một dòng attempt mới**, không
`UPDATE` đè lên attempt trước — giữ lại toàn bộ lịch sử các vòng REWORK/sửa kết quả, thay vì chỉ còn
`updatedAt` như thiết kế cũ (`docs/decisions/qc-request-attempt-split.md`). `qc_requests` vẫn là nơi
mọi gate/list/detail khác đọc — các cột `status`/`result`/`disposition`/... trên đó là **mirror của
attempt mới nhất**, ghi lại ngay sau khi insert attempt, cùng transaction. `qc_requests.attemptCount`
đếm số attempt đã có; `GET /iqc/:iqcId` đọc thẳng attempt mới nhất cho các cột chỉ tồn tại ở tầng
attempt (`ac`/`re`/`codeLetter` — snapshot AQL lúc kiểm, xem `docs/decisions/
qc-aql-master-data.md`). `GET /oqc/:oqcId` cũng đọc attempt mới nhất, nhưng chỉ để lấy
`qcEvidence`/`dispositionEvidence` — `OqcResDto` không còn expose `ac`/`re`/`codeLetter`, FE tra
sống các số đó qua `GET /oqc/aql-plan` thay vì đọc một bản đóng băng trên response chi tiết.

IQC: phase 1 chỉ có `GET` list + `GET stats` + `POST` tạo; phase 2 thêm `GET :iqcId` (chi tiết) +
`POST :iqcId/confirm` (xác nhận PASS/FAIL); phase 3 thêm `POST :iqcId/resolve` (chọn xử lý cho FAIL)
— **route này đã bị xoá ở phase 5**, gộp vào `confirm`; phase 4 thêm `PATCH :iqcId` (sửa 4 field
ngữ cảnh); **phase 5** làm lại `confirm` thành nút "Lưu" duy nhất (QC tự chọn `result`, gộp chọn
`disposition`, ghi chú/SL OK-NG/bộ phận QC/2 bộ file đính kèm), nối `WAITING_RETURN → COMPLETED`
vào `supplier_returns.post`; **phase 6** thêm `DELETE :iqcId` (chỉ khi còn `NOT_INSPECTED`) đi cùng
gate mới ở `inventory-issues`.

**Đường tạo IQC thứ hai, tự động:** `POST /inventory-receipts/:id/confirm` với `requiresIqc = true`
sinh một dòng `qc_requests` (`kind = INCOMING`, `NOT_INSPECTED`) cho mỗi dòng phiếu nhập,
qua `IqcService.createInspectionsFromReceipt(tx, ...)` — chạy trong transaction của
`InventoryReceiptsService.confirmInventoryReceipt`, không phải một call riêng ngoài transaction như
`POST /iqc` tay. Các dòng sinh ra vẫn đi qua đúng vòng đời bên dưới — `confirm`/`PATCH` không phân
biệt dòng tạo tay hay tạo tự động.

**Đường tạo IQC thứ ba, cũng tự động:** `POST /outsourcing-receipts` với `requiresIqc = true` sinh
**N dòng** (1/dòng phiếu OS-IN) qua `IqcService.createInspectionsFromOutsourcingReceipt(tx, ...)` —
**khác** đường thứ hai ở chỗ gọi ngay trong transaction `create` (không phải một bước `confirm`
riêng, `outsourcing_receipts` không có bước nháp/trạng thái `PENDING_IQC` nào — xem
`docs/decisions/outsourcing-no-draft.md`) và **không gate** việc tạo phiếu — hàng đã về nhà máy vật
lý trước khi IQC chạy, không phải "về kho" theo nghĩa `inventory_balances` (gia công ngoài không ghi
tồn, `docs/decisions/wip-not-stocked.md`). Mỗi dòng neo **trực tiếp** vào đúng dòng OS-IN sinh ra nó
(`outsourcingReceiptItemId`) và đúng công đoạn `OUTSOURCE` của nó
(`productionJobId`/`productionJobOperationId`, denormalize từ `outsourcingOrderItem` qua
`outsourcingOrderItemId` của dòng OS-IN) — đây là neo mà `getJobQcCoverage` (xem "Cross-domain
dependencies") dùng để gộp chung với OQC theo công đoạn, thay cho join mờ
`(outsourcingReceiptId, itemId)` của thiết kế trước (một OS-IN gộp được nhiều Job khác nhau cùng
NCC, join mờ có thể lẫn Job). `outsourcingReceiptId` trên mỗi dòng vẫn giữ, cùng vai trò trace mức
chứng từ như `inventoryReceiptId`/`purchaseOrderId`.

Ba đường tạo trên (`POST /iqc` tay + 2 đường tự động) là toàn bộ cách một dòng IQC (`kind =
INCOMING`) ra đời.

**OQC (Outgoing/Final QC)** — gắn theo **công đoạn** (`production_job_operations`), không phải cả
Job (`docs/decisions/oqc-per-operation.md`). **Chỉ áp cho công đoạn `type = INHOUSE`** — công đoạn
`type = OUTSOURCE` QC bằng nhánh IQC ở trên (gia công ngoài không có NCC nội bộ để "trả xưởng sửa",
nhưng có NCC gia công để trả hàng lỗi — đúng khuôn IQC hơn); `OqcService.createOqcForJob` tự loại
công đoạn `OUTSOURCE` ngay trong câu `SELECT` resolve công đoạn Cấp 0 (không match join → `E213`),
không để lộ lựa chọn sai ngay từ đầu — xem "Trigger từ production" bên dưới.

## Core concepts (IQC — `kind = INCOMING`)

**Không có header/items như `inventory_receipts`** — khác `supplier_returns` (cũng phẳng) ở chỗ IQC
không bắt buộc phải xuất phát từ một phiếu nhập kho cụ thể: `inventoryReceiptId`/`purchaseOrderId`
là tuỳ chọn, chỉ để trace ở mức chứng từ. `supplierId`/`itemId`/`quantity` do IQC tự giữ
(denormalized), không suy từ dòng nhập kho.

**Ba enum, một quy tắc suy `status`:**

```
result       PASS | FAIL                                — nullable (chưa kiểm = NULL)
disposition  CONCESSION | SORT | RETURN     — chỉ có nghĩa khi result = FAIL
status       NOT_INSPECTED | PENDING | WAITING_RETURN | COMPLETED
```

- Tạo mới không gửi `result` → `status = NOT_INSPECTED` ("Chưa kiểm") — dòng tồn tại nhưng chưa có
  kết quả. Đây là `status` duy nhất còn đổi lại được nhiều lần sau đó, qua `POST /iqc/:iqcId/confirm`
  (xem mục "Lưu kết quả QC" bên dưới) — **trừ** khi đã `WAITING_RETURN` (đã chốt đường trả NCC).
- `result = PASS` → `status = COMPLETED` ngay, `disposition` bỏ trống. `POST /iqc` (tạo tay) chặn
  gửi kèm cả hai (`E139`); `POST /iqc/:iqcId/confirm` không chặn — server tự bỏ qua `disposition`
  khi PASS, xem mục "Lưu kết quả QC" bên dưới.
- `result = FAIL`, chưa gửi `disposition` → `status = PENDING` ("Chờ xử lý").
- `result = FAIL`, `disposition = CONCESSION` (chấp nhận đặc biệt — không cần trả hàng) →
  `status = COMPLETED` ngay.
- `result = FAIL`, `disposition = SORT` (phân loại, tách SL OK/NG) hoặc `RETURN` (trả cả lô) — cả
  hai đều cần xuất hàng NG ra khỏi kho → `status = WAITING_RETURN` ("Chờ trả NCC"), **và** cùng lúc
  tự sinh một dòng `supplier_returns` (DRAFT) cho phần hàng NG (xem "Cross-domain dependencies").

`IqcService.resolveIqcStatus` là nơi duy nhất áp quy tắc này — dùng chung cho cả `POST /iqc` (khi
gửi `result` ngay lúc tạo) lẫn `POST /iqc/:iqcId/confirm`; `chk_qc_requests_disposition_requires_fail` ở DB
là chốt chặn cuối, không phải nơi tính `status`.

## Lưu kết quả QC IQC (`POST /iqc/:iqcId/confirm`)

Nút "Lưu" **duy nhất** của trang chi tiết IQC — mỗi lần gọi **insert 1 dòng `qc_inspections` mới**
(attempt, field vắng mặt trong payload nghĩa là attempt đó không có giá trị, không phải "giữ
nguyên" của attempt trước) rồi cập nhật `qc_requests` làm mirror, gọi lại được **nhiều lần** trừ khi
dòng đã `WAITING_RETURN` (`E159` — đường trả NCC đã chốt, không cho đổi kết quả nữa). Route
`POST /iqc/:iqcId/resolve` cũ đã gộp hẳn vào đây — 1 nút Lưu không thể trung thực điều khiển 2
endpoint dùng-1-lần riêng biệt. Xem `docs/decisions/qc-request-attempt-split.md` cho lý do đổi từ
`UPDATE` đè sang insert attempt.

1. **QC tự chọn `result` (PASS/FAIL) — server không suy từ AQL nữa.** `inspectionLevel`/`aqlLevel`
   vẫn gửi lên và server snapshot `ac`/`re`/`codeLetter` thật vào attempt vừa tạo qua
   `resolveAqlPlan()` (`src/api/iqc/iqc-aql.query.ts`, tra bảng `qc_aql_plans`/`qc_aql_rules`, xem
   `docs/decisions/qc-aql-master-data.md`) để FE hiện khối "gợi ý", nhưng tra hụt (chưa có rule khớp
   lot size/level/AQL) **không còn chặn được `confirm`** — khác thiết kế phase 2 cũ.
2. `disposition` chỉ có ý nghĩa khi `result = FAIL` — gửi kèm `PASS` **không còn báo lỗi**, server
   tự bỏ qua (`disposition`/`sortOkQty`/`sortNgQty`/`dispositionNote` ép `NULL` trước khi ghi), QC
   toàn quyền quyết định `result`/`disposition`, không có check chéo giữa hai field
   (`chk_qc_requests_disposition_requires_fail`/`chk_qc_inspections_disposition_requires_fail` vẫn
   còn ở DB làm chốt chặn cuối, phòng ghi trực tiếp qua SQL). Riêng khi `disposition = SORT`, vẫn
   bắt buộc gửi kèm `sortOkQty`/`sortNgQty` (`E162` nếu thiếu) và phải cộng đúng `quantity` của dòng
   IQC (`E160`, so bằng số nguyên đã scale — cả 3 đều `numeric`); gửi 2 field này khi `disposition`
   khác `SORT` là `E161` — đây là toàn vẹn số liệu, không phải quyết định QC, nên vẫn giữ.
3. Ghi thêm: `resultNote`/`dispositionNote` (ghi chú, 2 mốc khác nhau — có thể ghi ở 2 lần lưu khác
   nhau), `qcDepartmentId` (bộ phận QC đã kiểm — FK `departments`, không phải text tự do), và 2 bộ
   file đính kèm độc lập `qcEvidenceFileIds`/`dispositionEvidenceFileIds` (bằng chứng kiểm tra vs.
   bằng chứng quyết định xử lý — xem "Bằng chứng đính kèm" bên dưới).
4. `confirmedBy`/`confirmedAt` trên `qc_requests` chỉ ghi ở lần lưu **đầu tiên** (mốc nghiệp vụ "đã
   có kết quả") — sửa lại kết quả ở lần lưu sau không ghi đè mốc này (`updatedAt` + attempt mới đã
   ghi lại việc sửa). Tương tự, `resolvedBy`/`resolvedAt` chỉ ghi khi `disposition` **mới xuất hiện**
   lần đầu.
5. **Lật `result` từ FAIL về PASS** — attempt mới đơn giản mang `disposition`/`sortOkQty`/
   `sortNgQty`/`dispositionNote` đều `NULL` (PASS không có quyết định xử lý), không xoá gì ở các
   attempt FAIL trước — bộ `DISPOSITION_EVIDENCE` của những lần FAIL đó vẫn còn nguyên, gắn đúng
   attempt sinh ra nó, không còn bị dọn theo lần lưu PASS như thiết kế cũ.
6. 4 field ngữ cảnh cũ vẫn còn nguyên: `inspectionStandard`/`inspectorName`/`measuringTools`/
   `inspectionDate` — `inspectorName` là text tự do, **tách biệt** với `confirmedBy` (tài khoản
   bấm nút "Lưu"): người kiểm thật ngoài xưởng có thể không có tài khoản trong hệ thống.
7. Khi `status` tính ra `WAITING_RETURN`, `confirmIqc` gọi
   `SupplierReturnsService.createFromIqcDisposition` **cùng transaction** — xem "Cross-domain
   dependencies". Vì `WAITING_RETURN` khoá mọi lần confirm sau đó, đây là lần **duy nhất** một dòng
   IQC chuyển sang trạng thái này, nên không cần guard chống tạo phiếu trả trùng.

⚠️ `qc_aql_rules` (Ac/Re theo từng code letter × AQL) hiện chỉ có dữ liệu seed một lần từ bảng giấy
mẫu — QC/kỹ thuật sửa qua `PATCH /qc-aql/plans/:planId` khi đối chiếu xong bản chính thức, không cần
deploy code (`docs/decisions/qc-aql-master-data.md`). Tra hụt chỉ ảnh hưởng độ chính xác của khối
gợi ý hiển thị, không còn ảnh hưởng khả năng lưu kết quả.

### AQL auto-suggest (`GET /iqc/aql-plan`)

Route mirror `GET /oqc/aql-plan` (xem mục OQC bên dưới) — cùng `resolveAqlPlan()`, cùng shape
`{codeLetter, sampleSize, ac, re}`, tra hụt trả `E219` (không dùng chung `E200` — mã đó namespace
`oqc_inspection.error.*`). Thuần lookup hiển thị, **không** ảnh hưởng `confirm` — IQC không auto-suy
`result` như OQC, khối AQL chỉ để FE gợi ý trước khi QC tự nhập.

## Bằng chứng đính kèm

`qc_files` — 1 bảng, discriminator `kind` (`QC_EVIDENCE`/`DISPOSITION_EVIDENCE` — enum
`QcFileKind`, khác `qc_requests.kind`/`qc_inspections.kind` là enum riêng, đừng nhầm hai
`kind` này), dùng chung cho cả IQC lẫn OQC — cả hai `confirmIqc`/`confirmOqc` đều insert vào bảng
này. `inspectionId` trỏ **attempt** (`qc_inspections.id`), không phải request — mỗi bộ file gắn đúng
lần kiểm sinh ra nó. Attempt append-only nên đây luôn là **insert-only** vào một `inspectionId` chưa
từng có dòng nào (`linkQcFiles`, `src/api/iqc/iqc.write.ts` — plain function dùng chung cả 2
module, không phải method riêng của `IqcService`), không còn ý nghĩa "replace-all theo
`(inspectionId, kind)`" như thiết kế trước khi tách request/attempt
(`docs/decisions/qc-request-attempt-split.md`). `UploadType.IQC_EVIDENCE`/`IQC_DISPOSITION_EVIDENCE`
(màn IQC) và `OQC_EVIDENCE`/`OQC_DISPOSITION_EVIDENCE` (màn OQC) đều map sang `FileKind.EVIDENCE`
(ảnh ∪ tài liệu, cap theo `upload.maxDocumentSize`) — bằng chứng QC vừa có ảnh chụp thực tế vừa có
tài liệu đo lường (PDF), không thuộc gọn một trong hai kind cũ. `UploadType` tách riêng theo module
(không dùng chung `IQC_*` cho cả OQC) để file trong registry `files` mang đúng nguồn gốc khi audit.

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

## Lifecycle (IQC)

`status` set lúc `POST /iqc`, đổi lại được nhiều lần qua `POST /iqc/:iqcId/confirm` cho tới khi
chạm `WAITING_RETURN` (khoá cứng — `E159`). Từ đó, `status` chỉ còn đổi được đúng một lần nữa,
**không** qua `IqcService` mà qua `completeIqcAfterSupplierReturn` (`src/api/iqc/iqc.write.ts`) —
gọi bởi `SupplierReturnsService.postSupplierReturn` khi kho xác nhận đã thật sự xuất hàng trả NCC,
`WAITING_RETURN → COMPLETED`. Đây là transition duy nhất không đi qua `resolveIqcStatus`.

## Business rules (IQC)

- `code` bất biến, unique **toàn bảng** `qc_requests` (không riêng theo `kind`) — tự sinh
  `IQC-{năm}-{số thứ tự trong năm, pad 5}` nếu không gửi, cùng khuôn `PNK`/`PXK`/`OQC-*`
  (`docs/domains/inventory.md`), cấp qua `document_sequences`. Không đụng OQC (`OQC-*` khác prefix).
- `disposition` chỉ có ý nghĩa khi `result = FAIL` — `POST /iqc` (tạo tay) validate ở service
  (`E139`); `confirm` không validate nữa (QC toàn quyền quyết định), server tự bỏ `disposition` về
  `NULL` khi PASS trước khi ghi. DB CHECK (`chk_qc_requests_disposition_requires_fail`) là lớp
  phòng thủ cuối cho cả hai đường ghi.
- `sortOkQty`/`sortNgQty` luôn cùng NULL hay cùng có giá trị (`chk_qc_requests_sort_qty_pair`), chỉ hợp lệ
  khi `disposition = SORT` (`chk_qc_requests_sort_qty_requires_sort`), và cộng lại đúng `quantity`
  (`chk_qc_requests_sort_qty_total`, so `numeric` chính xác tuyệt đối).
- `inventoryReceiptId`/`purchaseOrderId`/`outsourcingReceiptId` không bắt buộc — hàng kiểm ngoài
  luồng PO (ví dụ NCC giao tay) vẫn tạo được IQC, dùng `reason` (text tự do) thay cho PO trên màn
  hiển thị "PO / Lý do". Tối đa **một trong hai** cặp (mua/gia công ngoài) khác `null` cùng lúc —
  `chk_qc_requests_source_exclusive` (không thể vừa mua vừa gia công ngoài). Nếu `disposition` ra
  `SORT`/`RETURN` mà không suy được kho trả (kiểm lần lượt `inventoryReceipt.warehouseId` →
  `purchaseOrder.receiptWarehouseId`; dòng sinh từ OS-IN — `outsourcingReceiptId` khác `null` —
  **luôn** trả `null` hợp lệ, không phải lỗi, vì `outsourcing_receipts` không có cột kho và
  `SupplierReturnsService.shouldPostStock` không bao giờ trừ tồn cho phiếu trả gốc OS-IN) →
  không nguồn nào có → `E163`, chặn `confirm`.
- **Dòng IQC không có `supplierId` (sinh từ phiếu `RETURN` gắn `clientId`) không chọn được
  `disposition = SORT`/`RETURN`** — `E254`, chặn trước khi mở transaction `confirm`. Lý do:
  `SupplierReturnsService.createFromIqcDisposition` đòi `supplierId` khác null để tự sinh phiếu trả
  NCC, và chưa có bảng/luồng tương đương cho khách hàng (BUG-065, `docs/domains/inventory.md` mục
  "Nhập từ khách hàng"). Hàng khách trả bị FAIL chỉ xử lý được bằng `CONCESSION`.
- `inspectionLevel`/`aqlLevel`/`sampleSize`/`defectQty`/`inspectionStandard`/`inspectorName`/
  `measuringTools`/`confirmedBy`/`confirmedAt` đều nullable — chỉ có giá trị sau khi
  `POST /iqc/:iqcId/confirm` lưu lần đầu; trước đó (`NOT_INSPECTED`) là `NULL`.
- `resolvedBy`/`resolvedAt` cũng nullable — chỉ có giá trị khi dòng FAIL đã được chọn phương án xử
  lý; tách biệt với `confirmedBy`/`confirmedAt`.
- `inspectionDate` là `timestamp` (có giờ) — set lúc tạo, sửa lại được qua confirm hoặc PATCH.

## Invariants (IQC)

- Không có FK mức dòng tới `purchase_order_items`/`inventory_receipt_items` — `purchase_order_
  items` không có số thứ tự dòng nên không tái tạo được kiểu hiển thị `PO2406001-01`; PO/NK trên
  IQC chỉ trace tới mức chứng từ. Cùng lý do, `outsourcingReceiptItemId` (dòng OS-IN) trace được
  tới mức dòng — `outsourcing_receipt_items` có `id` ổn định, khác `purchase_order_items`.
- `itemId` không bị ràng buộc `type = RM` ở DB/service (giống mọi chỗ khác dùng `items` — xem
  `docs/domains/product-structure.md`), dù nghiệp vụ thực tế IQC luôn là vật tư nhập.
- CHECK `sample_size > 0` / `defect_qty >= 0` / `aql_level > 0` khi các cột này có giá trị — chốt
  chặn cuối, không phải nơi tính plan AQL (đó là `resolveAqlPlan()`, giờ chỉ mang tính tham khảo,
  không quyết định `result`). `aql_level` **không** khoá cứng vào 6 mức chuẩn ANSI/ASQ Z1.4 — thêm
  mức mới vào `qc_aql_plans` (Phase B, `docs/decisions/qc-aql-master-data.md`) không bị CHECK ở đây
  chặn INSERT.
- `supplierId`/`clientId`/`productionJobId`/`productionJobOperationId` **nullable ở tầng cột** (dùng
  chung với nhánh OUTGOING). Trước BUG-038/065 chỉ `supplierId` được đảm bảo non-null cho dòng
  `kind = INCOMING`; BUG-038/065 nới CHECK để chấp nhận `clientId` thay thế (phiếu nhập `RETURN` gắn
  khách hàng, loại trừ lẫn nhau với `supplierId` — `chk_qc_requests_supplier_client_exclusive`).
  `chk_qc_requests_incoming_supplier` (đòi một trong hai non-null) đã **bỏ hẳn** để phục vụ phiếu
  nhập `receiptType = ADJUSTMENT` ("nhập từ khác", `docs/domains/inventory.md`) — dòng IQC sinh từ
  phiếu này có cả `supplierId` lẫn `clientId` null hợp lệ, `resolveIqcSourceIds` trả thẳng
  `{null, null}` thay vì `E152`. Điểm chặn cho `kind = INCOMING` giờ hoàn toàn ở service, không còn
  DB CHECK nào ràng cột này. Code cũ từng cast `supplierId` non-null sau khi lọc `kind = INCOMING`
  — không còn đúng, đã bỏ (`IqcService.ensureIqcSavable`); nơi nào thật sự cần `supplierId` khác
  null (tự sinh phiếu trả NCC) phải tự chặn riêng (`E254`, xem Business rules). Xem
  `docs/decisions/qc-single-table.md`.

## Cross-domain dependencies (IQC)

- **← Inventory**: `POST /inventory-receipts/:id/confirm` (`requiresIqc = true`) là nơi duy nhất
  ngoài `POST /iqc` ghi vào `qc_requests` (`kind = INCOMING`) — xem "Đường tạo thứ hai" ở
  Purpose.
- **→ Inventory**: `POST /inventory-receipts/:id/post` chặn (`E153`) khi phiếu đang `PENDING_IQC`
  mà còn phiếu IQC nào của nó chưa `COMPLETED` (kể cả khi chưa có phiếu IQC nào) — cổng chất lượng
  nằm ở phía `inventory-receipts`, domain này không tự đẩy trạng thái phiếu nhập.
- **→ Inventory (Gate xuất kho sản xuất)**: `InventoryIssuesService.postInventoryIssue`
  (`issueType = PRODUCTION`) chặn (`E203`) nếu còn ≥1 phiếu IQC chưa `COMPLETED` của cùng
  `(itemId, warehouseId)` — `hasPendingIqcForItems` (`src/api/iqc/iqc.query.ts`, plain function,
  không DI, tự lọc `kind = INCOMING`). Suy kho qua `inventoryReceipt.warehouseId`; phiếu IQC tạo tay
  hoặc sinh từ OS-IN (không gắn `inventoryReceiptId`) không suy được kho thì bỏ qua, không chặn —
  xem `docs/decisions/qc-gates-on-stock-moves.md`.
- **↔ Inventory (Supplier Returns)**: `confirmIqc` tự sinh một dòng `supplier_returns` (DRAFT) khi
  `status` chuyển `WAITING_RETURN` (`SupplierReturnsService.createFromIqcDisposition`, cùng
  transaction). Chiều ngược lại, khi kho `post` phiếu trả đó,
  `completeIqcAfterSupplierReturn` (plain function, không qua DI — tránh vòng lặp module vì
  `IqcModule` đã import `SupplierReturnsModule`) hoàn tất dòng IQC. `supplier_returns.iqc_id` chỉ
  trỏ được vào dòng `kind = INCOMING` — composite FK `(iqc_id, qc_kind)` (`docs/decisions/
  qc-single-table.md`), không phải FK đơn giản như trước gộp bảng. Xem
  `docs/workflows/supplier-return.md`.
- **← Inventory (Gia công ngoài)**: `POST /outsourcing-receipts` với `requiresIqc = true` là đường
  tạo tự động thứ ba (ngoài `POST /iqc` tay và `confirm` phiếu nhập) — xem "Đường tạo thứ ba" ở
  Purpose. `outsourcingReceiptItemId`/`productionJobId`/`productionJobOperationId` trên mỗi dòng
  IQC sinh ra neo thẳng vào công đoạn `OUTSOURCE` nguồn — dùng bởi `getJobQcCoverage` (xem mục OQC,
  Cross-domain dependencies).
- **→ Purchasing**: `purchaseOrderId` liên kết tuỳ chọn tới PO — thuần để trace, không đọc ngược.
- **→ Partners**: `supplierId` hoặc `clientId` (một trong hai) bắt buộc tới `suppliers`/`clients`
  (khi `kind = INCOMING`) — `clientId` từ BUG-038/065.
- **→ Product Structure**: `itemId` bắt buộc tới `items`.
- **→ Identity/Access**: `qcDepartmentId` liên kết tuỳ chọn tới `departments`.
- **→ Files**: `qc_files.fileId` tới `files` — xem "Bằng chứng đính kèm" ở trên.

## Common mistakes (IQC)

1. **Tưởng `status` suy runtime từ `result`/`disposition` như một view.** Không — nó là cột lưu
   thật. `NOT_INSPECTED`/`PENDING` còn đổi lại được nhiều lần qua `confirm`; `WAITING_RETURN` thì
   khoá cứng, chỉ `completeIqcAfterSupplierReturn` đổi tiếp được (đúng một lần).
2. **Tưởng có route `POST /iqc/:iqcId/resolve` riêng để chọn `disposition`.** Đã xoá — gộp vào
   `confirm` từ phase 5.
3. **Đi tìm bảng con `iqc_items` (nhiều vật tư/1 phiếu).** Không có — `qc_requests` vẫn phẳng, 1
   dòng = 1 lô kiểm 1 vật tư. Có bảng con thật là `qc_inspections`, nhưng nó là **lần kiểm** (mỗi
   `confirm` = 1 dòng, append-only), không phải danh sách vật tư — xem `docs/decisions/
   qc-request-attempt-split.md`.
4. **Tưởng `POST /iqc/:iqcId/confirm` tự tính `result` từ Ac/Re, không nhận từ client.** Sai từ
   phase 5 — QC tự chọn `result`; bảng AQL chỉ còn tính `ac`/`re` tham khảo, snapshot vào attempt vừa
   tạo, `getIqc` đọc lại từ attempt mới nhất chứ không tính lại lúc đọc.
5. **Tưởng có route `POST /iqc` khác để tạo hàng loạt.** Không — hàng loạt chỉ sinh từ
   `IqcService.createInspectionsFromReceipt`/`createInspectionsFromOutsourcingReceipt` (nội bộ,
   gọi từ `inventory-receipts`/`outsourcing-receipts`), dùng `generateIqcCodes` (số nhiều, một câu
   cấp luôn N số liên tiếp qua `document_sequences`) chứ không lặp gọi `generateIqcCode` (số ít) N
   lần.
6. **Tưởng `WAITING_RETURN → COMPLETED` chưa có route.** Có từ phase 5 —
   `SupplierReturnsService.postSupplierReturn` gọi `completeIqcAfterSupplierReturn` khi kho xác
   nhận xuất trả. Đừng nhầm hàm này với `resolveIqcStatus`/`confirmIqc` — nó là một transition
   riêng, không đi qua `IqcService`.
7. **Tưởng chỉ có 2 đường tạo (`POST /iqc` tay + phiếu nhập mua).** Từ khi có gia công ngoài, còn
   đường thứ ba: `POST /outsourcing-receipts` (`requiresIqc = true`) — xem Purpose.
8. **Tưởng IQC không có route xoá.** Có từ phase 6 — `DELETE /iqc/:iqcId`, chỉ khi còn
   `NOT_INSPECTED` (`E206`) — đường gỡ đi kèm gate IQC mới ở `inventory-issues` (xem "Cross-domain
   dependencies"), không phải một route CRUD đầy đủ.
9. **Tưởng `iqc_inspections`/`oqc_inspections` vẫn là hai bảng riêng.** Đã gộp thành
   `qc_requests` + cột `kind` từ `docs/decisions/qc-single-table.md` — `IqcService`/
   `OqcService` đọc/ghi cùng một bảng, phân biệt bằng `eq(kind, ...)` ở mọi query. `IqcService`/
   `OqcService`/route/DTO không đổi hình dạng, chỉ đổi bảng đích.
10. **Tưởng `confirm` lại (sửa `result`, thêm vòng REWORK) ghi đè mất lần kiểm trước.** Không còn từ
    `docs/decisions/qc-request-attempt-split.md` — mỗi `confirm` insert 1 dòng `qc_inspections` mới,
    lần kiểm trước vẫn còn nguyên, chỉ không còn là "hiện hành" trên `qc_requests` (mirror) nữa.
11. **Tưởng `GET /iqc/:iqcId`/`GET /oqc/:oqcId` trả danh sách các lần kiểm.** Không — trả đúng
    request hiện hành (mirror). `IqcResDto` cộng thêm `ac`/`re`/`codeLetter` đọc từ attempt mới
    nhất; `OqcResDto` đọc attempt mới nhất chỉ để lấy evidence (AQL tra sống qua
    `GET /oqc/aql-plan`). Chưa có DTO nào trả mảng lịch sử attempt (phạm vi Phase A không làm,
    xem `docs/decisions/qc-request-attempt-split.md`).

## OQC (Outgoing/Final QC — `kind = OUTGOING`)

Kiểm chất lượng **công đoạn** theo phương pháp AQL, trước khi cho nhập kho thành phẩm. Khung phân
vai: **IQC đảm nhiệm QC vật tư** (hàng nhập từ NCC, và từ phase gia công ngoài — công đoạn
`OUTSOURCE`), **OQC đảm nhiệm QC công đoạn nội bộ** (`type = INHOUSE`) bên trong một Job sản xuất.
Gắn theo từng công đoạn (`production_job_operations`), không phải cả Job — xem
`docs/decisions/oqc-per-operation.md`. Cùng gốc khái niệm AQL (`resolveAqlPlan()`, `AQL_LEVELS`,
`IqcInspectionLevel`, `IqcResult` — tái dùng thẳng, cùng pgEnum Postgres, không nhân đôi) nhưng
`OqcDisposition` (`ACCEPT`/`REWORK`/`SCRAP`) là enum **riêng**, không dùng `IqcDisposition`
(`CONCESSION`/`SORT`/`RETURN`) — OQC là QC nội bộ sản xuất, không có NCC để trả hàng.

### Core concepts

**Một dòng = một lô kiểm của một công đoạn `INHOUSE`.** `productionJobOperationId`/`productionJobId`
liên kết tới `production_job_operations`/`production_jobs`, **cả hai bắt buộc khi
`kind = OUTGOING`** (`chk_qc_requests_outgoing_job` — cột vật lý nullable vì dùng chung với nhánh `INCOMING`,
xem `docs/decisions/qc-single-table.md`) — một khi LSX đã `APPROVED`, không có đường nào xoá được
cây `production_job_operations`/`production_job_bom_items`/`production_jobs` của nó nữa
(`ensureItemsNotLockedByProduction` chặn `E080` khi LSX còn thao tác được, tức là còn `PENDING`, lúc
đó Job/công đoạn **chưa hề tồn tại**) — nên hai cột này không cần phòng hờ mồ côi.
`productionJobId` denormalize từ `operation.productionJobId`, server tự set — dùng để lọc/join theo
Job không phải qua `production_job_operations`, và là neo cho 2 gate cross-domain (xem bên dưới).
`operationCode`/`operationName`/`bomItem.code`/`bomItem.name` trên response **không phải cột lưu** —
đọc thẳng qua relation `productionJobOperation`/`productionJobOperation.bomItem` lúc `GET`
(`OqcResDto`/`PageOqcResDto` trả nested `operation`/`bomItem`). `itemId` NOT NULL, snapshot từ
`bomItem.itemId` của node BOM chứa công đoạn — node mất `itemId` (`set null`, item gốc bị xoá) thì
không tạo được OQC (`E199`).

**Node Cấp 0 (bước Lắp ráp/đóng gói cuối) cũng là một công đoạn `INHOUSE` bình thường** —
`production_job_bom_items` có thêm đúng một node `itemType = 'FG'` mỗi Job (khi item FG có khai
routing Cấp 0), đứng cuối cây, mang chính công đoạn Cấp 0 của FG; OQC gắn vào công đoạn của node
này y hệt mọi node WIP khác, không route/bảng riêng — xem `docs/decisions/oqc-per-operation.md`,
mục "QC cho Cấp 0". Gate nhập kho TP (`E209`, xem Cross-domain dependencies) đọc cờ `isFinalAssembly`
qua `itemType = 'FG'` của node này.

**`quantity` là lot size QC tự nhập, không suy tự động.** Trần chặn không phải một số cố định mà là
tiến độ thật của chính công đoạn: `operation.completedQuantity` (xưởng tự báo qua
`PATCH /production-jobs/:jobId/operations/:operationId` — bước Lắp ráp của node Cấp 0 chỉ mở khi
mọi công đoạn khác của Job đã báo hoàn thành, `E210`) — xem "Điều kiện tạo" bên dưới.

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
- `resultAuto` server tự suy từ `defectQty` so `ac` của plan AQL (`resolveAqlResult()`) — thuần gợi ý
  hiển thị. `result` QC gửi lên **thắng** nếu có, vắng thì lấy `resultAuto`; QC toàn quyền ghi đè
  `resultAuto`, không cần `resultNote` giải trình (`E201` đã nghỉ hưu).
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
- `PASS` mà vẫn gửi `disposition` **không còn bị chặn** (`E202` đã nghỉ hưu) — server tự bỏ
  `disposition`/`dispositionNote` về `NULL` trước khi ghi, khớp `chk_qc_requests_disposition_requires_fail`
  vẫn còn ở DB làm chốt chặn cuối.

`OqcService.resolveOqcStatus` là nơi duy nhất áp quy tắc suy `status`. Không nhánh nào ghi ngược
`production_job_operations.completedQuantity` — kể cả `SCRAP` (giải phóng lại quota bằng cách không
tính vào Σ đã xin QC, không phải bằng cách trừ `completedQuantity`) — tránh race với thao tác tay
của xưởng, xem `docs/domains/production.md`.

Một dòng `disposition = SCRAP` mang **hai vai trò tách biệt**: với `createOqcForJob` (Σ đã xin QC),
nó bị loại ra — coi như chưa từng xin; với `getJobQcCoverage` (gate nhập kho/giao hàng, xem
Cross-domain dependencies bên dưới), nó **cũng** bị loại ra khỏi `total`/`finalCompleted` — dù
`status = COMPLETED`, một Job chỉ toàn dòng SCRAP không được tính là "đã QC xong". Hai chỗ dùng cùng
điều kiện loại trừ nhưng khác lý do: một để mở lại quota, một để không cho hàng đã loại bỏ lọt gate.

### Trigger từ production — "Yêu cầu QC" (`POST /production-jobs/:jobId/qc`)

Route tạo OQC duy nhất — **cấp Job, không phải cấp công đoạn**, và **không nhận body**: 1 cú bấm,
server tự suy toàn bộ. Đã bỏ popup "chọn công đoạn cần QC" (`GET /oqc/inspectable-operations`) và
route tạo cấp-công-đoạn cũ (`POST /oqc` nhận `productionJobOperationId!`/`quantity!`/
`inspectionDate!`/`note?`) — mỗi Job = đúng 1 FG, nên "yêu cầu QC cho Job" tự nhiên nghĩa là QC cho
chính bước lắp ráp/thành phẩm (node Cấp 0) của nó.

Route sống ở `production-jobs` (`ProductionJobsController.requestJobQc` → gọi
`OqcService.createOqcForJob` qua DI — `ProductionJobsModule` import `OqcModule`). Toàn bộ logic gói
trong một hàm — một câu `SELECT` duy nhất (2 `LEFT JOIN`: `productionJobs → productionJobBomItems`
lọc `itemType='FG'` → `productionJobOperations` lọc `type ≠ OUTSOURCE`, sắp `sortOrder DESC LIMIT 1`)
gộp cả 3 điều kiện tồn tại, rồi 2 câu tính SL đã xin QC chạy song song. Thứ tự kiểm:

1. Job tồn tại (`E082`, tái dùng — cùng ngữ nghĩa `production-jobs`).
2. Job đang `IN_PROGRESS` (`E175`).
3. Job có node BOM `itemType = 'FG'` (Cấp 0, `docs/decisions/oqc-per-operation.md` mục "QC cho Cấp
   0") với ít nhất 1 công đoạn `type ≠ OUTSOURCE` (gia công ngoài chỉ QC qua IQC, không qua OQC) —
   thiếu thì `E213`. Node có nhiều công đoạn hợp lệ thì lấy công đoạn `sortOrder` lớn nhất.
4. Công đoạn Cấp 0 vừa resolve đã `completedDate` chưa — thiếu thì `E214`. Nhờ `E210`
   (`PATCH .../operations/:operationId`) đã đảm bảo công đoạn Cấp 0 không thể `completedDate` trừ
   khi **mọi** công đoạn khác của Job đã xong trước, kiểm đúng công đoạn này tương đương kiểm cả
   Job — không cần tự lặp qua từng công đoạn.
5. Node BOM còn `itemId` để snapshot làm `OQC.itemId` — mất thì `E199`.
6. Σ `quantity` đã xin QC của **mọi công đoạn as-used cùng node** (không riêng công đoạn Cấp 0),
   cộng lô mới, không vượt `plannedQuantity` (đã đóng băng) của node — vượt thì `E176`.
7. Σ `quantity` đã xin QC của **riêng công đoạn Cấp 0** phải bằng 0 — do lô kiểm luôn lấy trọn
   `completedQuantity` (không phải một phần), có dòng nào trước đó nghĩa là xin lại lần hai, chắc
   chắn vượt trần — chặn bằng `E198`.
8. Tạo OQC — `quantity` = `completedQuantity` hiện tại của công đoạn Cấp 0, `inspectionDate = new
   Date()` (thời điểm bấm), `note = null`.

Không route Production nào đọc ngược dữ liệu OQC (chiều **đọc** không đổi) — tóm tắt OQC theo công
đoạn từng hiển thị trên `GET /production-jobs/:jobId/bom` đã bỏ cùng lúc route đó đổi sang trả bảng
vật tư, và `getOqcSummaryByJobOperationIds` đã xoá khỏi `src/api/oqc/oqc.query.ts`. Chiều **ghi**
thì khác: `ProductionJobsModule` nay import `OqcModule` — ngoại lệ duy nhất, có chủ đích, chỉ để gọi
`createOqcForJob`; `getJobQcCoverage` (chiều đọc, dùng cho gate nhập kho/giao hàng) vẫn là plain
function, không qua DI.

### AQL auto-suggest (`GET /oqc/aql-plan`)

Route mới, trả `{codeLetter, sampleSize, ac, re}` tra từ `resolveAqlPlan()` (`src/api/iqc/
iqc-aql.query.ts`) theo `quantity` (lot size)/`inspectionLevel`/`aqlLevel` — tra hụt (không có rule
`qc_aql_rules` nào khớp) trả `E200`. FE gọi route này để gợi ý `sampleSize` trước khi QC nhập
`defectQty`.

⚠️ Dữ liệu `qc_aql_plans`/`qc_aql_rules` được seed một lần từ bảng giấy mẫu tự điền lại theo kiến
thức chuẩn ANSI/ASQ Z1.4 (không tra trực tiếp bản gốc) — **bắt buộc QC/kỹ thuật đối chiếu từng rule**
với bảng chính thức qua `PATCH /qc-aql/plans/:planId` trước khi coi là số liệu go-live
(`docs/decisions/qc-aql-master-data.md`). Dùng chung với IQC (không nhân đôi bảng), nhưng chỉ OQC
dùng để **auto-suy `result`** — IQC vẫn giữ hành vi cũ (QC tự chọn `result` hoàn toàn, bảng AQL chỉ
tính `ac`/`re` tham khảo). Hai module cố tình lệch nhau ở điểm này, đừng "đồng bộ hoá" nhầm sau này.

### Lưu kết quả OQC (`POST /oqc/:oqcId/confirm`)

1. Chặn nếu đã `COMPLETED` (`E177`) — mọi status khác (`NOT_INSPECTED`/`PENDING`/`REWORK`) confirm
   lại được nhiều lần; mỗi lần gọi insert 1 dòng `qc_inspections` mới (attempt), giữ lại lịch sử mỗi
   vòng REWORK thay vì ghi đè (`docs/decisions/qc-request-attempt-split.md`).
2. Nhận `inspectionLevel!`/`aqlLevel!`/`defectQty!` bắt buộc; `sampleSize?`/`result?` giờ **tuỳ
   chọn** — vắng thì server tự điền (`sampleSize` từ plan AQL, `result` từ `resultAuto`); cả
   `result` lẫn `resultAuto` đều vắng (không tra được plan, QC cũng không tự chọn) → `E200`.
3. `disposition?`/`dispositionNote?` — chỉ có ý nghĩa khi `result` cuối cùng = FAIL; gửi kèm PASS
   **không còn báo lỗi** (`E202` nghỉ hưu), server tự bỏ về `NULL` trước khi ghi. `disposition ∈
   {ACCEPT, SCRAP}` không còn bắt buộc `dispositionNote` (`E215` nghỉ hưu) — QC toàn quyền quyết
   định, AQL/Ac-Re chỉ là gợi ý hiển thị.
4. `confirmedBy`/`confirmedAt` chỉ ghi ở lần lưu đầu tiên. `resolvedBy`/`resolvedAt` chỉ ghi khi
   `disposition` **mới xuất hiện** lần đầu — cùng khuôn IQC.

### Xoá phiếu (`DELETE /oqc/:oqcId`)

Chỉ hợp lệ khi `status = NOT_INSPECTED` ("chưa kiểm", trước khi QC lưu kết quả lần đầu) — ngược
lại `E178`. Hard delete. `REWORK` **không** xoá được (đã từng confirm) — chỉ tiếp tục sửa qua
`confirm`, không có đường xoá riêng cho nhánh rework.

### Business rules (OQC)

- **QC toàn quyền quyết định `result`/`disposition` — AQL/Ac-Re/`resultAuto` chỉ là gợi ý hiển thị.**
  `confirmIqc`/`confirmOqc` không còn validate chéo giữa các lựa chọn của QC (`E139`/`E201`/`E202`/
  `E215` đều đã nghỉ hưu, xem `error-code.constant.ts`) — chỉ còn giữ tối thiểu: phải có `result` nào
  đó dùng được (`E200`, OQC), và SL OK/NG khi SORT phải cộng đúng lô (`E160`-`E162`, IQC — đây là
  toàn vẹn số liệu, không phải quyết định QC, nên vẫn giữ). DB CHECK
  (`chk_qc_requests_disposition_requires_fail`/`chk_qc_inspections_disposition_requires_fail`) vẫn
  còn nguyên làm chốt chặn cuối cho ca ghi trực tiếp qua SQL — server tự ép `disposition`/
  `dispositionNote`/`sortOkQty`/`sortNgQty` về `NULL` khi PASS trước khi ghi (không phải "check", chỉ
  chuẩn hoá) nên đường ghi bình thường không bao giờ chạm CHECK đó.
- `code` bất biến, unique **toàn bảng** `qc_requests`, tự sinh `OQC-{năm}-{số thứ tự trong
  năm, pad 5}` nếu không gửi — cùng khuôn `IQC-*`/`PNK-*`/`PXK-*`, cấp qua `document_sequences`.
  Cho phép client gửi `code` ghi đè.
- File đính kèm bằng chứng — mirror IQC, xem "Bằng chứng đính kèm": `confirmOqc` nhận
  `qcEvidenceFileIds`/`dispositionEvidenceFileIds`, `getOqc` trả `qcEvidence`/`dispositionEvidence`
  (attempt mới nhất). `dispositionEvidenceFileIds` bị bỏ qua khi `result = PASS`, cùng nhịp
  `disposition`/`dispositionNote`.
- "PO" hiển thị trên màn OQC = `orders.code` — tính lúc đọc bằng join
  `production_jobs → production_orders → orders`, **không lưu cột**.

### Cross-domain dependencies (OQC)

- **← Production**: `productionJobOperationId` bắt buộc trỏ tới một công đoạn `INHOUSE` của Job
  `IN_PROGRESS` lúc tạo — đọc một chiều. Không có chiều ngược lại: Production không đọc gì từ
  Quality, kể cả để hiển thị.
- **→ Inventory (Gate nhập kho TP)**: `POST /inventory-receipts/:id/confirm` với
  `receiptType = PRODUCTION` chặn nếu Job chưa có dòng QC nào hoặc còn dòng nào chưa `COMPLETED`
  (`E196`) — `getJobQcCoverage` (`src/api/oqc/oqc.query.ts`, plain function, không DI). Hàm này gộp
  **cả hai nhánh** qua neo chung `productionJobOperationId`: công đoạn `INHOUSE` chỉ có thể có dòng
  `OUTGOING` (OQC) trỏ vào, công đoạn `OUTSOURCE` chỉ có thể có dòng `INCOMING` (IQC từ OS-IN) trỏ
  vào — không giao nhau, nên LEFT JOIN một cột này gộp đúng cả hai, không cần lọc `kind`. Riêng
  công đoạn Cấp 0 (node `itemType = 'FG'`) phải có ≥1 dòng OQC `COMPLETED` (`E209`, tách khỏi
  `E196` — Job chưa từng QC thành phẩm thì không cho nhập dù mọi dòng khác đã xong; bỏ qua gate này
  nếu Job không có node Cấp 0). SL nhập (cộng dồn mọi phiếu PRODUCTION khác cùng Job) vẫn chặn trần
  theo `production_jobs.quantity` (`E197`, không so với SL QC PASS). Xem `docs/domains/
  inventory.md`, `docs/decisions/qc-single-table.md`.
- **→ Inventory (Gate giao hàng)**: `POST /outbound-orders/:id/confirm` (`DRAFT →
  PENDING_DELIVERY`) chặn (`E205`) nếu còn Job nào (suy từ `outbound_order_items.productionJobId`)
  chưa qua hết QC — tái dùng nguyên `getJobQcCoverage`. Xem `docs/domains/inventory.md`.

## Common mistakes (OQC)

1. **Tưởng OQC không lọc `type = OUTSOURCE`.** Có — `OqcService.createOqcForJob` chỉ chọn công đoạn
   Cấp 0 `type ≠ OUTSOURCE` ngay trong câu `SELECT`; nhánh `OUTSOURCE` QC bằng IQC. `E211` (từng
   chặn ở tầng service) đã khai tử — điều kiện này nay nằm trong chính câu truy vấn, không còn chỗ
   nào ném ra mã đó nữa.
2. **Tưởng Cấp 0 (bước Lắp ráp) vẫn không có nơi QC riêng.** Có từ `docs/decisions/
   oqc-per-operation.md` mục "QC cho Cấp 0" — node `production_job_bom_items.itemType = 'FG'`,
   không phải bảng mới.
3. **Tưởng `oqc_inspections` vẫn là bảng riêng của module `oqc`.** Đã gộp vào
   `qc_requests` (`kind = OUTGOING`) — xem mục IQC, Common mistake #9.
4. **Tưởng `getJobOqcClearance` vẫn tồn tại.** Đổi tên/hợp nhất thành `getJobQcCoverage`
   (`docs/decisions/qc-single-table.md`), cùng vị trí file (`src/api/oqc/oqc.query.ts`).
5. **Tưởng `POST /oqc` hay popup `GET /oqc/inspectable-operations` vẫn tồn tại.** Đã bỏ — tạo OQC
   nay chỉ qua `POST /production-jobs/:jobId/qc` (cấp Job, không nhận body). Job không khai báo
   routing Cấp 0 → `E213`; Job còn công đoạn nào chưa `completedDate` → `E214`.
6. **Tưởng `confirmOqc` vẫn chặn `result = PASS` kèm `disposition`, hoặc bắt buộc `resultNote`/
   `dispositionNote`.** Không còn — `E201`/`E202`/`E215` đã nghỉ hưu, QC toàn quyền quyết định (xem
   "Business rules (OQC)"). Cùng lý do, `confirmIqc` cũng không còn chặn (`E139` chỉ còn ở
   `POST /iqc` tạo tay).

## Related docs

- `docs/decisions/qc-single-table.md` — vì sao IQC/OQC gộp một bảng, hình dạng cột theo `kind`,
  `getJobQcCoverage` hợp nhất gate.
- `docs/decisions/qc-request-attempt-split.md` — vì sao `qc_requests`/`qc_inspections` tách request/
  lần kiểm, mirror hoạt động thế nào.
- `docs/decisions/qc-aql-master-data.md` — AQL chuyển sang master data, `qc_inspections` là nơi
  snapshot Ac/Re/codeLetter thật.
- `docs/domains/inventory.md` — `supplier_returns`, nơi IQC `WAITING_RETURN` nối vào; gate xuất kho
  sản xuất theo IQC; gate nhập kho TP + gate giao hàng theo QC hợp nhất.
- `docs/domains/production.md` — `production_jobs`/`production_job_operations`/node Cấp 0, nơi OQC
  gắn vào.
- `docs/workflows/final-qc.md` — luồng đầy đủ OQC: "Yêu cầu QC" từ production → confirm (auto-suggest
  + rework) → 2 gate nhập kho/giao hàng.
- `docs/workflows/stock-movement.md` — gate IQC chặn xuất kho sản xuất.
- `docs/workflows/supplier-return.md` — luồng đầy đủ từ disposition tới hoàn tất IQC.
- `docs/workflows/outsourcing-round-trip.md` — luồng OS-OUT → OS-IN → IQC tuỳ chọn (đường tạo thứ
  ba vào bảng này).
- `docs/decisions/oqc-per-operation.md` — vì sao OQC đổi từ gắn Job sang gắn công đoạn, node Cấp 0.
- `docs/decisions/qc-gates-on-stock-moves.md` — vì sao thêm gate IQC/OQC vào luồng xuất/nhập kho.
- `docs/domains/purchasing.md` — `purchaseOrders` mà IQC trace tới.
- `docs/domains/partners.md` — `suppliers` mà IQC bắt buộc gắn vào.
