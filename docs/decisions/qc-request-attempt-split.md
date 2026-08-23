# Tách `qc_requests` (lô kiểm) / `qc_inspections` (lần kiểm, append-only)

**Trạng thái:** còn hiệu lực

## Bối cảnh

Trước đợt này, `quality_inspections` (nay `qc_requests`) là một bảng phẳng 1-dòng-1-lô: mỗi lần QC
bấm "Lưu" (`IqcService.confirmIqc`/`OqcService.confirmOqc`) là một câu `UPDATE` ghi đè toàn bộ quyết
định QC lên chính dòng đó. Với OQC, vòng REWORK có thể lặp nhiều lần trên cùng một phiếu (`status =
REWORK` không khoá `confirm` lại) — khi lần cuối ra PASS, `UPDATE` xoá sạch mọi vết của các lần REWORK
trước, chỉ còn `updatedAt` đổi. Phát hiện khi audit 3 luồng disposition OQC (ACCEPT/REWORK/SCRAP):
không có cách nào trả lời "lô này đã bị trả xưởng sửa mấy lần, mỗi lần lỗi gì" — đúng loại câu hỏi
audit QC cần trả lời được.

Cùng lúc, user đề xuất một thiết kế schema QC theo chuẩn ERP QM (SAP-style: inspection lot +
characteristics + results + usage decision, bảng cha `qc_inspections` + nhiều bảng con). Đánh giá chi
tiết trong kế hoạch triển khai (không phải doc này — quyết định cuối chỉ giữ 2 phần có bằng chứng
nghiệp vụ thật: tách request/attempt và AQL master data (`docs/decisions/qc-aql-master-data.md`)).
Phần checklist tiêu chí/mẫu/lỗi chi tiết (`qc_samples`/`qc_defects`/...) **hoãn**, không có FE hỗ trợ
nhập ở mức đó và không có bằng chứng cần.

## Quyết định

Tách một bảng thành hai: `qc_requests` (lô kiểm — đổi tên từ `quality_inspections`, giữ gần như
nguyên vẹn mọi cột) là cha, `qc_inspections` (lần kiểm/attempt) là con — mỗi lần `confirm` (kể cả
IQC lẫn OQC) **luôn insert một dòng attempt mới**, không update đè lên attempt cũ.
`qc_requests`/`qc_inspections` **không đảo** `docs/decisions/qc-single-table.md` — xem mục "Trục
request/attempt là một quyết định khác" ở đó.

### `qc_requests` giữ vai trò "bản mirror hiện hành"

`status`/`result`/`disposition`/`sortOkQty`/`sortNgQty`/`resultAuto`/`resultNote`/`dispositionNote`/
`confirmedBy`/`confirmedAt`/`resolvedBy`/`resolvedAt` trên `qc_requests` là **mirror của attempt mới
nhất** — nguồn duy nhất ghi các cột này là `IqcService.confirmIqc`/`OqcService.confirmOqc`, ngay sau
khi insert dòng `qc_inspections` mới, cùng một transaction. Không có helper dùng chung ép cả hai
service đi qua (khác đề xuất ban đầu) — `IqcService`/`OqcService` viết logic riêng vì hai nhánh có
field khác nhau (IQC có SORT/qcDepartment/inspectionStandard/đính kèm, OQC không), giữ code mỗi
service đọc thẳng, dễ theo dõi hơn một helper phải nhận đủ tham số cho cả hai nhánh.

**Lý do giữ mirror thay vì luôn `JOIN`/`SELECT DISTINCT ON` attempt mới nhất mỗi lần đọc**: 9 hàm/
query gate đang có (`getJobQcCoverage`, `getInspectedQuantityByOperationId`,
`getInspectedQuantityByBomItemId`, `hasPendingIqcForItems`, `areInspectionsCompletedForReceipt`,
...) đọc đúng mức "lô kiểm", tức mức `qc_requests` — giữ mirror nghĩa là 7 mã lỗi chặn cứng luồng
kho (`E196`/`E205`/`E209`/`E203`/`E153`/`E198`/`E176`) không cần sửa một mệnh đề SQL nào, chỉ đổi
tên bảng. `POST /iqc/:id/confirm`, `POST /oqc/:id/confirm`, `GET`/`PATCH`/`DELETE` giữ nguyên `:id`
trỏ vào request — API không breaking change, migration giữ nguyên `id` cũ.

### Attempt luôn tạo mới — không có nhánh "sửa nhẹ thì không tính là 1 lần kiểm"

Bản thiết kế đầu định để IQC chỉ tạo attempt mới khi khối quyết định thực sự đổi (còn sửa
`inspectorName` không tính), để tránh sổ audit phình vì nút Lưu-toàn-bộ. Bỏ nhánh này khi triển khai
— đơn giản hơn (không cần diff attempt mới nhất với payload mới để quyết định có insert hay không),
và một dòng audit thêm cho một lần bấm Lưu không phải chi phí đáng lo với khối lượng QC thực tế của
hệ thống này.

### Composite FK 3 cột giữ nguyên 2 CHECK cross-nhánh trên bảng attempt

`chk_qc_requests_disposition_requires_fail` (so `disposition` với `result`) và
`chk_qc_requests_sort_qty_total` (so `sortOkQty + sortNgQty` với `quantity`) là đúng 2 CHECK mà
`docs/decisions/qc-single-table.md` từng dùng để loại bỏ mô hình cha–con IQC/OQC — cả hai vế phải
nằm cùng một bảng vật lý để Postgres viết được. Ở trục request/attempt này, `sortOkQty`/`sortNgQty`/
`disposition`/`result` sống **đầy đủ** trên `qc_inspections` (giá trị thật của từng lần kiểm) và
**mirror lại** trên `qc_requests` (bản hiện hành, xem mục "`qc_requests` giữ vai trò 'bản mirror hiện
hành'" ở trên) — không phải "chuyển hẳn" khỏi bảng cha. `quantity` là lot size cố định, cũng mirror
xuống `qc_inspections` cùng `kind` — nếu chỉ có FK đơn `(qcRequestId) → qc_requests.id` thì 2 CHECK
trên (viết trên `qc_inspections`, so với chính giá trị mirror trên dòng đó) sẽ không có gì đảm bảo
mirror khớp đúng cha, nên cần composite FK 3 cột bên dưới.

Giải: `qc_inspections` mang thêm 2 cột **mirror** `kind`/`quantity` (giá trị luôn khớp cha), và một
composite FK 3 cột `(qcRequestId, kind, quantity) → qc_requests(id, kind, quantity)` (cần
`UNIQUE (id, kind, quantity)` phụ trên `qc_requests`, `uq_qc_requests_id_kind_quantity`) — Postgres
tự đảm bảo `kind`/`quantity` trên mỗi attempt luôn khớp đúng cha của nó, nhờ đó 2 CHECK cross-nhánh
trên viết được ngay trên `qc_inspections` mà không cần join sang bảng cha. `qc_inspections` không
nhân bản nguyên văn toàn bộ CHECK của `qc_requests` — chỉ những CHECK thuộc về nội dung một lần kiểm
(khoảng 10/16, gồm 2 cross-nhánh trên) mới lặp lại; các CHECK thuộc về vòng đời/nguồn gốc request
(`source_exclusive`, `outsourcing_item`, `incoming_supplier`, `outgoing_no_supplier`, `outgoing_job`,
`attempt_count_non_negative`) chỉ có ý nghĩa ở mức request nên chỉ sống trên `qc_requests`;
`qc_inspections` bù lại 3 CHECK riêng của attempt (`attempt_no_positive`, `ac_re_pair`, `ac_re_order`)
không tồn tại ở bảng cha. Cùng thủ thuật repo đã dùng cho `supplier_returns (iqc_id, qc_kind)`.

### Không có cột trỏ ngược "attempt mới nhất"

`qc_requests.attemptCount` (int, đếm số attempt đã có) — không có `lastInspectionId` trỏ ngược, vì
cột đó buộc `qc-requests.ts` phải dereference `qcInspections.id` ngay lúc module-load (FK thường,
không phải composite, vẫn cần object thật để `.references()`), tạo vòng lặp module thật với
`qc-inspections.ts` (file đó đã dereference `qcRequests.*` cho composite FK 3 cột ở trên). Đọc
attempt mới nhất khi cần (`getIqc`/`getOqc`) qua `ORDER BY attemptNo DESC LIMIT 1`, không qua cột trỏ
ngược.

### `qc_files` chuyển sang treo dưới attempt, không còn replace-all

`inspectionId` đổi trỏ sang `qc_inspections.id` (trước là request). Attempt append-only nên
`IqcService.confirmIqc` chỉ **insert** bộ file cho attempt vừa tạo — không còn ca "attempt PASS lật
từ FAIL trước đó phải xoá sạch DISPOSITION_EVIDENCE cũ", vì attempt PASS đơn giản không có bộ file
đó (đã insert dưới attempt FAIL trước, vẫn còn nguyên ở đó cho lịch sử).

### `kind`/`INCOMING`/`OUTGOING` giữ nguyên tên — không đổi sang `type`/`IQC`/`OQC`

Dù bản vẽ gốc user đề xuất dùng `type`/`IQC`/`OQC`, quyết định giữ tên cũ: đổi tên không mang hành vi
mới nào, còn đổi physical Postgres enum value (`ALTER TYPE ... RENAME VALUE`) là bước migration rủi
ro nhất trong toàn bộ đợt này (không tự sinh được bằng `drizzle-kit`, dễ drop/create nhầm enum đang
có dữ liệu, cộng 2 composite FK bám vào giá trị enum đó) — không tương xứng lợi ích. Đổi được sau,
như một migration riêng, nếu thực sự cần khớp đúng bản vẽ.

### `supplier_returns` trỏ cả request lẫn attempt

`iqcId` (đổi FK sang `qc_requests`, giữ tên cột cũ) — dòng `SupplierReturnsService.
completeIqcAfterSupplierReturn` `UPDATE status = COMPLETED` là request, attempt append-only không
`UPDATE` được. Thêm `qcInspectionId` (composite FK `(qcInspectionId, qcKind) → qc_inspections(id,
kind)`) trỏ đúng attempt đã ra quyết định SORT/RETURN sinh ra phiếu trả — trả lời được "phiếu trả
NCC này sinh từ lần kiểm thứ mấy" khi một request có nhiều attempt.

## Không đổi

`ensureIqcSavable`/`ensureOqcConfirmable` (chặn `confirm` khi `WAITING_RETURN`/`COMPLETED`) vẫn kiểm
trên request, quy tắc y nguyên — tạo attempt mới không phải lúc nào cũng được phép, đây chính là cơ
chế đóng vòng REWORK mà gate kho đang dựa vào. `E198` (không cho xin QC lần 2 cùng công đoạn) vẫn là
chặn tạo **request** thứ 2, không đụng attempt. `resolveIqcStatus`/`resolveOqcStatus` vẫn là hàm
thuần — chỉ đọc `(result, disposition)`, không đọc DB — kết quả ghi 2 chỗ: mirror trên `qc_requests`
+ `resultingStatus` (thuần audit) trên attempt.

## Related docs

`docs/decisions/qc-single-table.md` (trục IQC/OQC — khác trục này). `docs/decisions/qc-aql-master-
data.md` (`qc_inspections` là nơi đóng khoảng hở snapshot AQL). `docs/domains/quality.md`.
