# Mô hình dữ liệu QC: gộp IQC/OQC, tách request/attempt

**Trạng thái:** còn hiệu lực. Gộp hai quyết định trước đây tách file (schema một bảng cho IQC/OQC +
tách request/attempt) — cùng định hình đúng hai bảng `qc_requests`/`qc_inspections`, luôn đọc cùng
nhau. Hai trục **độc lập nhau**: trục 1 là `INCOMING` (IQC) vs `OUTGOING` (OQC) — hai khái niệm khác
nhau, ăn chung phần lớn cột; trục 2 là 1 request có N lần kiểm theo thời gian (attempt) — cùng một
khái niệm, khác thời điểm.

## Trục 1 — Vì sao IQC/OQC gộp một bảng thay vì cha–con

Thiết kế trước tách `iqc_inspections`/`oqc_inspections` độc lập hoàn toàn. Khi thêm gia công ngoài
(công đoạn `OUTSOURCE` QC bằng IQC sinh từ OS-IN, không phải OQC), việc tách bảng lộ ba lỗi thật:
gate phải join mờ theo `(outsourcingReceiptId, itemId)` nên IQC của Job B lẫn vào clearance Job A;
một mã lỗi (`E212`) khoá chết khi OS-IN mặc định không yêu cầu IQC; phiếu OQC cũ vẫn gate công đoạn
`OUTSOURCE` nên bị gate hai lần. Gốc chung: mỗi loại QC mới bắt mọi gate phải học nó tồn tại, vì
không có một điểm đọc chung — và IQC/OQC vốn là supertype/subtype thật (phần lớn cột trùng nhau,
cùng khái niệm "một lần kiểm theo AQL"; SAP QM/Odoo cũng dùng một bảng inspection + type).

**Quyết định**: gộp về `qc_requests` + cột discriminator `kind` (`INCOMING`/`OUTGOING`), không tách
cha–con. Đã cân nhắc class-table inheritance và loại — hai CHECK đang có
(`chk_qc_requests_disposition_requires_fail`, `chk_qc_requests_sort_qty_total`) so cột thuộc hai
nhánh khác nhau nhưng phải nằm cùng bảng vật lý để Postgres viết CHECK cross-table được; cha–con thì
mất khả năng đó, phải đẩy xuống service (mất một lớp phòng thủ DB).

**Hình dạng**: cột chung (`id`/`code`/`kind`/`itemId`/`quantity`/khối AQL/`status`/audit); cột riêng
`INCOMING` (`supplierId`/`inventoryReceiptId`/`outsourcingReceiptId`/`purchaseOrderId`/`reason`/
`qcDepartmentId`/`sortOkQty`/`sortNgQty`); cột neo sản xuất dùng chung cả hai nhánh
(`productionJobId`/`productionJobOperationId` — `OUTGOING` bắt buộc, `INCOMING` có khi từ OS-IN).
Cột neo là chỗ gộp có giá trị thật: một công đoạn `INHOUSE` chỉ nhận dòng `OUTGOING`, một công đoạn
`OUTSOURCE` chỉ nhận dòng `INCOMING` — hai tập không giao nhau, nên một `LEFT JOIN` theo đúng cột
này tự nhiên gộp cả hai nhánh mà không cần lọc `kind` (`getJobQcCoverage`,
`src/api/oqc/oqc.query.ts`).

**Mất mát chấp nhận được**: `supplierId`/`productionJobId`/`productionJobOperationId` không còn
`NOT NULL` ở tầng cột — thay bằng CHECK theo `kind` (tương đương về đảm bảo, chỉ khác thông báo
lỗi). `supplier_returns.iqcId` cần composite FK `(iqcId, qcKind) → qc_requests(id, kind)` (cần
`UNIQUE (id, kind)` phụ) để giữ khả năng chỉ trỏ được vào dòng `INCOMING` — mất khả năng đó nếu chỉ
dùng FK đơn. Route/`ErrorCode`/DTO của `iqc`/`oqc` **giữ nguyên** — chỉ đổi bảng đích + thêm
`eq(kind, ...)` vào mọi `where`/`insert`; rủi ro chính là quên mệnh đề `kind`, không có kiểu con
TypeScript nào tự bắt lỗi này.

**Hệ quả — khai tử `E212`**: điều kiện của nó là tập con của `E196` sau khi `getJobQcCoverage` gộp
hai nhánh theo công đoạn — giữ số, không tái dùng.

## Trục 2 — Vì sao tách request (`qc_requests`)/attempt (`qc_inspections`)

Thiết kế trước: mỗi lần "Lưu" là một `UPDATE` đè lên chính dòng. Với OQC, vòng REWORK lặp nhiều lần
trên cùng phiếu — khi lần cuối PASS, `UPDATE` xoá sạch mọi vết REWORK trước, chỉ còn `updatedAt`
đổi. Không trả lời được "lô này bị trả xưởng sửa mấy lần, mỗi lần lỗi gì" — câu hỏi audit QC cần.

**Quyết định**: mỗi lần `confirm` (cả IQC lẫn OQC) **luôn insert 1 dòng `qc_inspections`** (attempt),
không update đè. `qc_requests` giữ vai trò **mirror của attempt mới nhất** —
`confirmIqc`/`confirmOqc` ghi mirror ngay sau khi insert attempt, cùng transaction. Giữ mirror (thay
vì luôn `JOIN`/`SELECT DISTINCT ON` mỗi lần đọc) vì ~9 hàm gate hiện có đọc đúng mức "lô kiểm" — giữ
mirror nghĩa là các gate kho (`E196`/`E205`/`E209`/`E203`/`E153`/`E198`/`E176`) không cần sửa một
mệnh đề SQL nào. API không breaking change, `:id` vẫn trỏ request.

**Composite FK 3 cột**: 2 CHECK cross-nhánh ở Trục 1 giờ cần so giá trị **mirror** trên
`qc_inspections` khớp đúng cha — `qc_inspections` mang thêm 2 cột mirror `kind`/`quantity`, composite
FK `(qcRequestId, kind, quantity) → qc_requests(id, kind, quantity)` (cần
`uq_qc_requests_id_kind_quantity`) đảm bảo khớp mà không cần join. `qc_inspections` không nhân bản
toàn bộ CHECK của cha — chỉ ~10/16 CHECK thuộc nội dung một lần kiểm mới lặp lại; CHECK thuộc vòng
đời/nguồn gốc request chỉ sống trên `qc_requests`. `qc_inspections` có thêm 3 CHECK riêng
(`attempt_no_positive`, `ac_re_pair`, `ac_re_order`) không tồn tại ở bảng cha.

**Không có cột trỏ ngược "attempt mới nhất"** (`lastInspectionId`) — sẽ buộc `qc-requests.ts`
dereference `qcInspections.id` ngay lúc module-load, tạo vòng lặp module thật với `qc-inspections.ts`
(file đó đã dereference `qcRequests.*` cho composite FK). Đọc attempt mới nhất qua
`ORDER BY attemptNo DESC LIMIT 1` khi cần.

`qc_files.inspectionId` đổi trỏ sang attempt (trước là request) — attempt append-only nên chỉ
insert bộ file mới, không còn ca "PASS phải xoá `DISPOSITION_EVIDENCE` cũ của FAIL trước". Mỗi
`confirm` luôn tạo attempt mới, kể cả chỉ sửa field ngữ cảnh — không có nhánh "sửa nhẹ không tính".
`supplier_returns` trỏ cả hai: `iqcId` (request, vì `completeIqcAfterSupplierReturn` cần `UPDATE`)
và `qcInspectionId` (composite FK, đúng attempt đã ra quyết định SORT/RETURN).

## Vòng lặp module khi implement (cả hai trục)

Composite FK (`foreignKey({...})`) nhận object trực tiếp, không nhận thunk — buộc file con
dereference `qcRequests.id`/`.kind` ngay lúc module-load. Nếu `qc-requests.ts` cũng import ngược để
khai `relations()`, hai chiều import tạo `ReferenceError`. Giải: tách `qcRequestsRelations` ra file
riêng (`qc-requests-relations.ts`) — cùng thủ thuật dùng cho `supplier_returns (iqcId, qcKind)`.

## Không đổi

`ensureIqcSavable`/`ensureOqcConfirmable` (chặn `confirm` khi `WAITING_RETURN`/`COMPLETED`) vẫn kiểm
trên request — tạo attempt mới không phải lúc nào cũng được phép, đây là cơ chế đóng vòng REWORK mà
gate kho dựa vào. `E198` vẫn chặn tạo **request** thứ 2, không đụng attempt. `kind`/`INCOMING`/
`OUTGOING` giữ nguyên tên (không đổi sang `type`/`IQC`/`OQC`) — đổi physical Postgres enum value là
migration rủi ro nhất đợt này, không tương xứng lợi ích.

## Đừng hoàn lại

- Thêm một loại QC mới (vd kiểm hàng khách trả) là thêm giá trị `kind` + cột neo/CHECK tương ứng —
  **không** phải tạo bảng mới. Một gate phải tự viết hàm join riêng cho một loại QC cụ thể là dấu
  hiệu neo công đoạn/kind đang thiếu, không phải lý do tách bảng lại.
- Đừng gộp lại `qc_requests`/`qc_inspections` thành một bảng phẳng — mất khả năng trả lời "lần kiểm
  thứ mấy, lúc nào" là quay lại đúng vấn đề đã sửa.

## Related docs

- `docs/decisions/oqc-per-operation.md` — mô hình node Cấp 0 + gate theo công đoạn, đọc từ bảng gộp.
- `docs/decisions/qc-gates-on-stock-moves.md` — gate hợp nhất dùng `getJobQcCoverage`.
- `docs/decisions/qc-aql-master-data.md` — nơi `qc_inspections` snapshot Ac/Re/`codeLetter`.
- `docs/domains/quality-iqc.md`, `docs/domains/quality-oqc.md`.
