# Đổi tên bảng/cột QC: `qc_requests`/`qc_inspections`/`qc_files` → `quality_inspections`/`quality_inspection_results`/`quality_inspection_evidences`

**Trạng thái:** hoàn tất (2026-08-29) — migration 3 bảng cũ sang 3 bảng mới, giữ nguyên cấu trúc/quyết
định của `docs/decisions/qc-data-model.md` (một bảng case-row + một bảng attempt-row append-only,
discriminator IQC/OQC), chỉ đổi tên vật lý + polymorphic hoá một phần cột nguồn. Bảng cũ
(`qc_requests`/`qc_inspections`/`qc_files`) và 3 cột cũ trên `supplier_returns` đã bị xoá — xem
"Step 6" ở cuối file.

## Bối cảnh

Đánh giá lại thiết kế QC (2026-08) kết luận ban đầu: schema hiện tại (`qc_requests`/`qc_inspections`,
discriminator `kind`) đã đúng, không cần đổi — hai lần đảo thiết kế trước đó (`docs/decisions/
qc-data-model.md`) đều sửa bug thật, có mục "Đừng hoàn lại" tường minh. User sau đó vẫn quyết định
migrate sang tên/cấu trúc mới, chấp nhận rủi ro + khối lượng việc lớn để đổi lấy tên bảng/cột đúng
domain hơn (`quality_inspections` thay vì `qc_requests` — không phải "request", là chính lô kiểm).

## Quyết định — chỉ đổi tên/polymorphic hoá, không đổi mô hình

Giữ nguyên **toàn bộ** kiến trúc của `qc-data-model.md`: một bảng case-row (mirror của attempt mới
nhất) + một bảng attempt-row append-only, discriminator một cột, hai CHECK cross-nhánh sống trên
cùng vật lý bảng attempt qua composite FK 3 cột. Không thêm bảng `quality_dispositions` (tra cứu
disposition) hay `quality_inspection_lots` — cả hai đã đề xuất rồi loại bỏ để giữ codebase đơn giản
(bảng dispositions sẽ làm CHECK `disposition_by_kind` yếu đi vì mất so sánh trực tiếp giá trị; lot là
khái niệm chưa ai dùng, dễ thêm sau như một cột nullable).

### Bảng đổi tên (giữ nguyên `id`, backfill qua `INSERT ... SELECT`)

| Cũ | Mới |
| --- | --- |
| `qc_requests` (case row) | `quality_inspections` |
| `qc_inspections` (attempt row) | `quality_inspection_results` |
| `qc_files` (evidence) | `quality_inspection_evidences` |

### Cột đổi tên trên `quality_inspections` (ex-`qc_requests`)

| Cũ | Mới | Ghi chú |
| --- | --- | --- |
| `code` | `inspectionNo` | DTO vẫn expose field `code` — không đổi API |
| `kind` (`INCOMING`/`OUTGOING`) | `inspectionType` (`IQC`/`OQC`) | **duy nhất** đổi cả tên cột lẫn giá trị Postgres enum — đảo ngược câu "không đổi physical enum value" ở `qc-data-model.md` |
| `result` | `decision` | Postgres enum mới `quality_inspection_decision` rộng hơn (`PENDING`/`PASS`/`FAIL`/`HOLD`/`PARTIAL`), nhưng chỉ `PASS`/`FAIL` có đường ghi — 3 giá trị còn lại để dành, chặn bằng CHECK |
| `inspectionDate` | `requestedAt` | |
| `resultNote` | `decisionNote` | |
| `confirmedBy`/`confirmedAt` | `inspectedBy`/`startedAt` | |
| `resolvedBy`/`resolvedAt` | `approvedBy`/`approvedAt` | |
| `inventoryReceiptId`/`outsourcingReceiptId`/`outsourcingReceiptItemId` | `originType`+`originId` (polymorphic) | Chỉ 3/8 cột nullable cũ gộp được — xem mục dưới |
| `disposition`, `sortOkQty`/`sortNgQty`, `reason`, `note`, `dispositionNote`, `inspectionStandard`/`inspectorName`/`measuringTools`, `qcDepartmentId`, `purchaseOrderId`/`supplierId`/`clientId`/`productionJobId`/`productionJobOperationId`/`itemId`/`quantity`/`attemptCount`/`createdBy`/`createdAt`/`updatedAt` | giữ nguyên tên | |

Cột mới duy nhất ngoài rename thuần: `completedAt` (nullable, để dành — chưa có đường ghi đợt này).

### Cột đổi tên trên `quality_inspection_results` (ex-`qc_inspections`)

`qcRequestId→qualityInspectionId`, `kind→inspectionType`, `inspectionDate→inspectedAt`,
`result→decision`, `resultNote→decisionNote`, `confirmedBy→inspectedBy`. `resultingStatus` giữ tên,
đổi tập giá trị theo D2 (status collapse) dưới đây.

### Cột đổi tên trên `quality_inspection_evidences` (ex-`qc_files`)

`inspectionId→qualityInspectionResultId`. `QcFileKind`/`qc_file_kind` → `QualityEvidenceKind`/
`quality_evidence_kind` (giá trị `QC_EVIDENCE`/`DISPOSITION_EVIDENCE` giữ nguyên).

### `supplier_returns` — 3 cột cũ đã xoá (Step 6, 2026-08-29)

`iqcId`/`qcInspectionId`/`qcKind` (trỏ bảng cũ) đã bị xoá cùng migration dọn bảng QC cũ — xem "Step
6" ở cuối file. `qualityInspectionId`/`qualityInspectionResultId`/`qcInspectionType` (trỏ bảng mới,
composite FK mới) là đường ghi/đọc duy nhất.

## D1 — Đổi physical enum value: đảo ngược quyết định cũ

`qc-data-model.md` (mục "Không đổi") từng chốt: "`kind`/`INCOMING`/`OUTGOING` giữ nguyên tên — đổi
physical Postgres enum value là migration rủi ro nhất đợt này, không tương xứng lợi ích." Quyết định
này **đảo ngược** câu đó: `kind`/`INCOMING`/`OUTGOING` → `inspectionType`/`IQC`/`OQC`. Lý do đảo:
đây chính là mục tiêu của đợt migrate (tên đúng domain hơn), và chiến lược tạo-bảng-mới-rồi-backfill
(không `ALTER TYPE RENAME VALUE` tại chỗ) loại bỏ đúng rủi ro mà câu cũ lo ngại — đổi giá trị enum
tại chỗ không rollback được, tạo bảng mới thì bảng cũ còn nguyên tới khi xoá.

## D2 — Gộp `status`: mất một CHECK DB thật, chuyển xuống service

`status` cũ (`qc_status`, 5 giá trị `NOT_INSPECTED`/`PENDING`/`WAITING_RETURN`/`REWORK`/`COMPLETED`,
`WAITING_RETURN` chỉ IQC dùng được còn `REWORK` chỉ OQC — ép bằng `chk_qc_requests_status_by_kind`)
gộp thành `quality_inspection_status` 5 giá trị mới (`DRAFT`/`PENDING`/`IN_PROGRESS`/`COMPLETED`/
`CANCELLED` — `CANCELLED` để dành, chưa có đường ghi):

| `status` cũ | `status` mới |
| --- | --- |
| `NOT_INSPECTED` | `DRAFT` |
| `PENDING` | `PENDING` |
| `WAITING_RETURN` (IQC) | `IN_PROGRESS` |
| `REWORK` (OQC) | `IN_PROGRESS` |
| `COMPLETED` | `COMPLETED` |

**Mất mát chấp nhận:** DB không còn tự phân biệt được IQC đang chờ trả NCC với OQC đang REWORK ở
cột `status` — CHECK cũ (`chk_qc_requests_status_by_kind`) ép đúng tập giá trị theo `kind` không
còn tương đương được sau khi gộp; CHECK mới (`chk_quality_inspections_status_in_use`) chỉ còn chặn
`CANCELLED`. Không mất **thông tin** (vẫn suy lại được `IN_PROGRESS` nghĩa là gì qua
`inspectionType` của chính dòng đó — IQC-scoped hay OQC-scoped luôn biết trước), chỉ mất một lớp
DB tự chặn nhầm giá trị.

**Cập nhật 2026-08-29 — đảo một phần D5 dưới đây:** `status` API giờ trả thẳng
`QualityInspectionStatus` (`DRAFT`/`PENDING`/`IN_PROGRESS`/`COMPLETED`/`CANCELLED`), không còn dịch
ngược về `IqcStatus`/`OqcStatus` cũ. Xem "Cập nhật 2026-08-29" ở D5.

## D3–D7 — các quyết định nhỏ hơn, đã chốt qua thảo luận

- **D3**: `decision` nullable, chỉ `PASS`/`FAIL` có đường ghi thật — khớp `IqcResDto.result: IqcResult
  | null` hiện tại, FE không đổi.
- **D4**: `disposition` giữ là cột enum phẳng (`quality_disposition`, type Postgres **mới hoàn
  toàn** — không phải rename từ `qc_disposition`, xem "Step 6" — giá trị union
  `IqcDisposition`+`OqcDisposition` giữ nguyên) — **không** tách bảng tra cứu `quality_dispositions`.
  Nhờ vậy CHECK so trực tiếp giá trị (`sort_qty_requires_sort`) giữ nguyên mạnh, không yếu đi.
- **D5** (gốc, khi migrate schema): Route/DTO field name, giá trị enum string trả ra API,
  `ErrorCode`, permission **giữ nguyên 100%** — FE không cần đổi gì. Đánh đổi: cần lớp dịch `status`
  2 chiều (D2) ở `IqcService`/`OqcService`/`reports.service.ts`, vì đây là field DUY NHẤT giá trị
  thật sự đổi giữa DB và API.

  **Cập nhật 2026-08-29 — đảo phần "giá trị `status`" của D5, giữ nguyên phần còn lại:** theo yêu
  cầu người dùng ("đồng bộ vocabulary mới ra FE"), `status` trên `IqcResDto`/`PageIqcResDto`/
  `GetIqcsReqDto`/`OqcResDto`/`PageOqcResDto`/`GetOqcsReqDto`/`OpenNcrResDto` đổi type từ
  `IqcStatus`/`OqcStatus` sang `QualityInspectionStatus` — API giờ trả/nhận thẳng
  `DRAFT`/`PENDING`/`IN_PROGRESS`/`COMPLETED` (không còn `NOT_INSPECTED`/`WAITING_RETURN`/`REWORK`
  trên wire). `toIqcStatus`/`toOqcStatus` (chiều đọc của lớp dịch D2) đã xoá khỏi
  `quality-inspection-status.util.ts` — chỉ còn `toInspectionStatus` (chiều ghi, business logic
  `resolveIqcStatus`/`resolveOqcStatus` vẫn tính theo `IqcStatus`/`OqcStatus` cũ như trước, không
  đổi). `OpenNcrResDto.kind` (`INCOMING`/`OUTGOING`) **không đổi** — chỉ `status` đổi, đây là phạm vi
  hẹp nhất trong 3 mức đưa ra, người dùng chọn mức này. Mọi field khác (`code`, `result`,
  `inspectionDate`, `confirmedAt`, `resolverBy`...), mọi route, mọi `ErrorCode`, mọi permission vẫn
  giữ nguyên — phần còn lại của D5 vẫn đúng. FE tương ứng (`web-qlsx-start`) đổi cùng đợt — xem
  `src/lib/types/iqc.type.ts`/`oqc.type.ts`/`report.type.ts` bên đó.
- **D6**: `qc_aql_plans`/`qc_aql_rules` không đổi — AQL đã tối giản từ trước
  (`docs/decisions/qc-aql-master-data.md`), không có lý do đổi thêm.
- **D7**: Không thêm khái niệm lot/`unit_id` — ngoài phạm vi đợt này.

## Phát hiện quan trọng — `origin_type`/`origin_id` chỉ thay được 3/8 cột FK nullable cũ

Đã trace từng cột theo call site thật trước khi quyết định polymorphic hoá:

| Cột cũ | Gộp vào `origin_id` được không |
| --- | --- |
| `inventoryReceiptId`, `outsourcingReceiptItemId` | ✅ được |
| `outsourcingReceiptId` | ✅ được, nhưng suy lại phải join qua `outsourcing_receipt_items` (không còn cột riêng) |
| `purchaseOrderId` | ❌ — cùng tồn tại với `inventoryReceiptId` trên cùng 1 dòng (`createInspectionsFromReceipt`), một cặp origin không giữ được 2 giá trị cùng lúc |
| `supplierId`, `clientId` | ❌ — là đối tác (counterparty), không phải chứng từ nguồn; IQC tạo tay có supplier mà không có chứng từ nào |
| `productionJobId` | ❌ — dùng trực tiếp ở `closeJobIfQcCovered`, filter `getOqcs`/`getOqc`, `count(distinct)` trong `getQcStats` |
| `productionJobOperationId` | ❌ **chặn cứng** — `getJobQcCoverage` LEFT JOIN đúng cột này để gộp IQC-từ-OS-IN với OQC trong 1 câu (gate `E196`/`E205`/`E209`); gộp cột này vào origin sẽ tái tạo đúng bug "IQC Job B lẫn clearance Job A" mà `qc-data-model.md` đã sửa |

**Kết quả:** `origin_type`/`origin_id` (2 cột) thay đúng 3 cột chứng từ cũ (`INVENTORY_RECEIPT`/
`OUTSOURCING_RECEIPT_ITEM`/`MANUAL`); 5 cột còn lại (`purchaseOrderId`/`supplierId`/`clientId`/
`productionJobId`/`productionJobOperationId`) giữ nguyên làm FK thật, không đổi tên. Đánh đổi: mất
FK thật ở DB cho 3 cột đã gộp (validate ở service), đổi lấy `getIqcs`/`getIqc` phải viết lại từ
relational query (`db.query.qcRequests.findMany({with:{...}})`) sang `.select()` phẳng + join tường
minh — polymorphic column không dùng được trong `with: {...}` của Drizzle relational API.

## Chiến lược migrate

Tạo bảng mới → backfill (`INSERT ... SELECT`, giữ nguyên `id`) → cutover code (1 bước atomic, không
tách được vì `getJobQcCoverage` đọc chung IQC+OQC trong 1 câu) → bật composite FK/CHECK trên
`supplier_returns` sau khi code đã chạy ổn định → dọn bảng cũ (Step 6, thực hiện 2026-08-29). **Không**
`ALTER TABLE RENAME` tại chỗ — không rollback được giữa chừng, không có test tự động
(`docs/decisions/testing-paused.md`) trên một thay đổi chạm 5+ module.

## Step 6 (2026-08-29) — dọn bảng cũ

Xoá `qc_requests`/`qc_inspections`/`qc_files` (`DROP TABLE ... CASCADE`) + 3 cột cũ trên
`supplier_returns` (`iqcId`/`qcKind`/`qcInspectionId`, cùng CHECK/FK/index ăn theo) + 4 file schema
(`qc-requests.ts`, `qc-requests-relations.ts`, `qc-inspections.ts`, `qc-files.ts`). 6 TS enum thuần
vẫn còn dùng thật (`QcKind`, `IqcResult`, `IqcDisposition`, `OqcDisposition`, `IqcStatus`,
`OqcStatus`) chuyển sang `quality-enums.ts` trước khi xoá file — vẫn dùng ở `kind`/đường ghi
`toInspectionStatus()`/cast `.$type<>()`, không phải bảng chết. `QcFileKind` → đổi hẳn sang
`QualityEvidenceKind` (đã có sẵn, cùng 2 giá trị) thay vì chuyển, tránh trùng enum.

**Phát hiện khi làm Step 6 — sửa lại 1 giả định sai của bản kế hoạch gốc:** `qc_disposition` (Postgres
type cũ) **không hề được `ALTER TYPE RENAME`** sang `quality_disposition` như tài liệu này từng mô tả
(xem D4 cũ) — đọc thẳng `drizzle/0163_sleepy_namor.sql` cho thấy `quality_disposition` được `CREATE
TYPE` mới hoàn toàn, giá trị giống hệt nhưng là type độc lập. `qc_disposition` cũ vẫn tồn tại tới tận
Step 6, bị `DROP TYPE` tường minh cùng đợt này (5 type bị xoá: `qc_kind`, `qc_status`, `qc_result`,
`qc_disposition`, `qc_file_kind` — không đụng `qc_inspection_level`, vẫn dùng thật).

Migration sinh bởi `drizzle-kit generate` có bug thứ tự: `DROP TABLE ... CASCADE` tự xoá 2 FK trên
`supplier_returns` trước, khiến 2 câu `ALTER TABLE supplier_returns DROP CONSTRAINT` sinh sau đó lặp
lại thao tác trên constraint đã mất — phải tay đảo thứ tự thành "dọn `supplier_returns` trước, `DROP
TABLE` sau" (nội dung từng câu SQL không đổi, chỉ đổi thứ tự) mới áp được — cùng loại bug thứ tự
FK-trước-unique-index đã gặp ở bước tạo bảng mới đầu migration này.

## Đừng hoàn lại

- Đừng gộp `origin_type`/`origin_id` với 5 cột FK thật còn lại — đã trace và loại, xem mục "Phát
  hiện quan trọng". Cần lại thì đọc lý do ở đó trước khi thử lần hai.
- Đừng tưởng `status = IN_PROGRESS` tự phân biệt được IQC-chờ-trả-NCC với OQC-REWORK ở tầng DB — chỉ
  service (biết `inspectionType` của chính request) phân biệt được, xem D2.

## Related docs

- `docs/decisions/qc-data-model.md` — kiến trúc gốc (một bảng + discriminator, request/attempt) mà
  quyết định này migrate theo, không thay đổi.
- `docs/domains/quality-iqc.md`, `docs/domains/quality-oqc.md` — vocabulary API (`IqcStatus`/
  `OqcStatus`/`QcKind`) không đổi dù bảng vật lý đổi tên.
