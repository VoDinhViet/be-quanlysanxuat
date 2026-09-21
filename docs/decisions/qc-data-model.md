# Mô hình dữ liệu QC: gộp IQC/OQC, tách case row/attempt row

**Trạng thái:** còn hiệu lực. Gộp hai quyết định trước đây tách file (schema một bảng cho IQC/OQC +
tách request/attempt) — cùng định hình đúng hai bảng `quality_inspections`/`quality_inspection_results`,
luôn đọc cùng nhau. Hai trục **độc lập nhau**: trục 1 là `IQC` vs `OQC` — hai khái niệm khác nhau, ăn
chung phần lớn cột; trục 2 là 1 case row có N lần kiểm theo thời gian (attempt) — cùng một khái niệm,
khác thời điểm. Tên bảng/cột trong file này là tên **sau** đợt đổi tên
`docs/decisions/quality-schema-rename.md` (2026-08) — bản thân quyết định gộp bảng/tách attempt ở
đây **không đổi**, chỉ đổi tên vật lý.

## Trục 1 — Vì sao IQC/OQC gộp một bảng thay vì cha–con

Thiết kế trước tách `iqc_inspections`/`oqc_inspections` độc lập hoàn toàn. Khi thêm gia công ngoài
(công đoạn `OUTSOURCE` QC bằng IQC sinh từ OS-IN, không phải OQC), việc tách bảng lộ ba lỗi thật:
gate phải join mờ theo `(outsourcingReceiptId, itemId)` nên IQC của Job B lẫn vào clearance Job A;
một mã lỗi (`E212`) khoá chết khi OS-IN mặc định không yêu cầu IQC; phiếu OQC cũ vẫn gate công đoạn
`OUTSOURCE` nên bị gate hai lần. Gốc chung: mỗi loại QC mới bắt mọi gate phải học nó tồn tại, vì
không có một điểm đọc chung — và IQC/OQC vốn là supertype/subtype thật (phần lớn cột trùng nhau,
cùng khái niệm "một lần kiểm theo AQL"; SAP QM/Odoo cũng dùng một bảng inspection + type).

**Quyết định**: gộp về `quality_inspections` + cột discriminator `inspectionType` (`IQC`/`OQC`),
không tách cha–con. Đã cân nhắc class-table inheritance và loại — hai CHECK đang có
(`chk_quality_inspections_disposition_requires_fail`, `chk_quality_inspections_sort_qty_total`) so
cột thuộc hai nhánh khác nhau nhưng phải nằm cùng bảng vật lý để Postgres viết CHECK cross-table
được; cha–con thì mất khả năng đó, phải đẩy xuống service.

**Hình dạng**: cột chung (`id`/`inspectionNo`/`inspectionType`/`itemId`/`quantity`/khối AQL/`status`/
audit); cột riêng IQC (`supplierId`/`originType`+`originId`/`purchaseOrderId`/`reason`/
`qcDepartmentId`/`sortOkQty`/`sortNgQty`); cột neo sản xuất dùng chung cả hai nhánh
(`productionJobId`/`productionJobOperationId` — OQC bắt buộc, IQC có khi từ OS-IN). Cột neo là chỗ
gộp có giá trị thật: một công đoạn `INHOUSE` chỉ nhận dòng OQC, một công đoạn `OUTSOURCE` chỉ nhận
dòng IQC — hai tập không giao nhau, nên một `LEFT JOIN` theo đúng cột này tự nhiên gộp cả hai nhánh
mà không cần lọc `inspectionType` (`getJobQcCoverage`, `src/api/oqc/oqc.query.ts`).

`originType`/`originId` (polymorphic) thay 3/8 cột chứng từ nguồn cũ (`inventoryReceiptId`/
`outsourcingReceiptId`/`outsourcingReceiptItemId`) — **không** thay được `purchaseOrderId`/
`supplierId`/`clientId`/`productionJobId`/`productionJobOperationId`, 5 cột đó vẫn là FK thật. Lý do
đầy đủ (trace từng cột theo call site): `docs/decisions/quality-schema-rename.md`.

**Mất mát chấp nhận được**: `supplierId`/`productionJobId`/`productionJobOperationId` không còn
`NOT NULL` ở tầng cột — thay bằng CHECK theo `inspectionType` (tương đương về đảm bảo, chỉ khác
thông báo lỗi). `supplier_returns.qualityInspectionId` cần composite FK
`(qualityInspectionId, qcInspectionType) → quality_inspections(id, inspectionType)` (cần
`UNIQUE (id, inspectionType)` phụ) để giữ khả năng chỉ trỏ được vào dòng IQC — mất khả năng đó nếu
chỉ dùng FK đơn. Route/`ErrorCode`/DTO của `iqc`/`oqc` **giữ nguyên** — chỉ đổi bảng đích + thêm
`eq(inspectionType, ...)` vào mọi `where`/`insert`; rủi ro chính là quên mệnh đề đó, không có kiểu
con TypeScript nào tự bắt lỗi này.

**Hệ quả — khai tử `E212`**: điều kiện của nó là tập con của `E196` sau khi `getJobQcCoverage` gộp
hai nhánh theo công đoạn — giữ số, không tái dùng.

## Trục 2 — Vì sao tách case row (`quality_inspections`)/attempt row (`quality_inspection_results`)

Thiết kế trước: mỗi lần "Lưu" là một `UPDATE` đè lên chính dòng. Với OQC, vòng REWORK lặp nhiều lần
trên cùng phiếu — khi lần cuối PASS, `UPDATE` xoá sạch mọi vết REWORK trước, chỉ còn `updatedAt`
đổi. Không trả lời được "lô này bị trả xưởng sửa mấy lần, mỗi lần lỗi gì" — câu hỏi audit QC cần.

**Quyết định**: mỗi lần `confirm` (cả IQC lẫn OQC) **luôn insert 1 dòng `quality_inspection_results`**
(attempt), không update đè. `quality_inspections` giữ vai trò **mirror của attempt mới nhất** —
`confirmIqc`/`confirmOqc` ghi mirror ngay sau khi insert attempt, cùng transaction. Giữ mirror (thay
vì luôn `JOIN`/`SELECT DISTINCT ON` mỗi lần đọc) vì ~9 hàm gate hiện có đọc đúng mức "lô kiểm" — giữ
mirror nghĩa là các gate kho (`E196`/`E205`/`E209`/`E203`/`E153`/`E198`/`E176`) không cần sửa một
mệnh đề SQL nào. API không breaking change, `:id` vẫn trỏ case row.

**Composite FK 3 cột**: 2 CHECK cross-nhánh ở Trục 1 giờ cần so giá trị **mirror** trên
`quality_inspection_results` khớp đúng cha — bảng đó mang thêm 2 cột mirror `inspectionType`/
`quantity`, composite FK `(qualityInspectionId, inspectionType, quantity) →
quality_inspections(id, inspectionType, quantity)` (cần `uq_quality_inspections_id_type_quantity`)
đảm bảo khớp mà không cần join. `quality_inspection_results` không nhân bản toàn bộ CHECK của cha —
chỉ phần thuộc nội dung một lần kiểm mới lặp lại; CHECK thuộc vòng đời/nguồn gốc case row chỉ sống
trên `quality_inspections`. `quality_inspection_results` có thêm 3 CHECK riêng (`attempt_no_positive`,
`ac_re_pair`, `ac_re_order`) không tồn tại ở bảng cha.

**Không có cột trỏ ngược "attempt mới nhất"** (`lastResultId`) — sẽ buộc `quality-inspections.ts`
dereference cột của bảng attempt ngay lúc module-load, tạo vòng lặp module thật. Đọc attempt mới
nhất qua `ORDER BY attemptNo DESC LIMIT 1` khi cần.

`quality_inspection_evidences.qualityInspectionResultId` trỏ attempt (không phải case row) — attempt
append-only nên chỉ insert bộ file mới, không còn ca "PASS phải xoá `DISPOSITION_EVIDENCE` cũ của
FAIL trước". Mỗi `confirm` luôn tạo attempt mới, kể cả chỉ sửa field ngữ cảnh — không có nhánh "sửa
nhẹ không tính". `supplier_returns` trỏ cả hai: `qualityInspectionId` (case row, vì
`completeIqcAfterSupplierReturn` cần `UPDATE`) và `qualityInspectionResultId` (composite FK, đúng
attempt đã ra quyết định SORT/RETURN).

## D2 — `status` gộp giá trị theo `inspectionType`

Đợt đổi tên (`docs/decisions/quality-schema-rename.md`) gộp `WAITING_RETURN` (IQC)/`REWORK` (OQC) cũ
thành một giá trị DB chung `IN_PROGRESS` — DB không còn tự phân biệt được hai ca này ở cột `status`,
chỉ service (biết `inspectionType` của chính dòng) phân biệt được. API vẫn trả `IqcStatus`/
`OqcStatus` cũ nguyên vẹn qua lớp dịch 2 chiều
(`src/api/iqc/quality-inspection-status.util.ts`). Chi tiết đầy đủ: xem doc đó, mục D2.

## Vòng lặp module khi implement (cả hai trục)

Composite FK (`foreignKey({...})`) nhận object trực tiếp, không nhận thunk — buộc file con
dereference cột của bảng cha ngay lúc module-load. Nếu bảng cha cũng import ngược để khai
`relations()` referencing các cột đó theo cùng kiểu trực tiếp, hai chiều import tạo `ReferenceError`.
Giải: tách `qualityInspectionsRelations`/`qcRequestsRelations` ra file riêng — cùng thủ thuật dùng
cho `supplier_returns` (cả `(iqcId, qcKind)` cũ lẫn `(qualityInspectionId, qcInspectionType)` mới).

## Không đổi

`ensureIqcSavable`/`ensureOqcConfirmable` (chặn `confirm` khi tương đương `WAITING_RETURN`/
`COMPLETED`) vẫn kiểm trên case row — tạo attempt mới không phải lúc nào cũng được phép, đây là cơ
chế đóng vòng REWORK mà gate kho dựa vào. `E198` vẫn chặn tạo **case row** thứ 2, không đụng attempt.

**Đã đổi (đảo ngược so với bản trước)**: `inspectionType`/`IQC`/`OQC` — bản doc này từng chốt giữ
nguyên `kind`/`INCOMING`/`OUTGOING` vì "đổi physical enum value không tương xứng lợi ích". Đợt
`docs/decisions/quality-schema-rename.md` đảo lại quyết định đó — xem D1 ở doc đó cho lý do đảo.

## Đừng hoàn lại

- Thêm một loại QC mới (vd kiểm hàng khách trả) là thêm giá trị `inspectionType` + cột neo/CHECK
  tương ứng — **không** phải tạo bảng mới. Một gate phải tự viết hàm join riêng cho một loại QC cụ
  thể là dấu hiệu neo công đoạn/`inspectionType` đang thiếu, không phải lý do tách bảng lại.
- Đừng gộp lại `quality_inspections`/`quality_inspection_results` thành một bảng phẳng — mất khả
  năng trả lời "lần kiểm thứ mấy, lúc nào" là quay lại đúng vấn đề đã sửa.
- Đừng gộp `originType`/`originId` với 5 cột FK thật còn lại (`purchaseOrderId`/`supplierId`/
  `clientId`/`productionJobId`/`productionJobOperationId`) — đã trace và loại, xem
  `docs/decisions/quality-schema-rename.md`.

## Related docs

- `docs/decisions/quality-schema-rename.md` — đổi tên bảng/cột (2026-08): mapping đầy đủ, D1-D7, lý
  do `origin` chỉ thay được 3/8 cột, lớp dịch `status`.
- `docs/decisions/oqc-per-operation.md` — mô hình node Cấp 0 + gate theo công đoạn, đọc từ bảng gộp.
- `docs/decisions/qc-gates-on-stock-moves.md` — gate hợp nhất dùng `getJobQcCoverage`.
- `docs/decisions/qc-aql-master-data.md` — nơi `quality_inspection_results` snapshot Ac/Re/`codeLetter`.
- `docs/domains/quality-iqc.md`, `docs/domains/quality-oqc.md`.
