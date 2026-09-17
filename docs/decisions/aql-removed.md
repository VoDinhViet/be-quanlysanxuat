# Bỏ toàn bộ tính năng AQL khỏi IQC/OQC

**Trạng thái:** còn hiệu lực (2026-09-17)

## Bối cảnh

`ConfirmIqcReqDto`/`ConfirmOqcReqDto` bắt buộc QC nhập bộ field AQL (`inspectionLevel`, `aqlLevel`,
`sampleSize`, `defectQty`) mỗi lần `confirm`, dù theo `docs/decisions/qc-aql-master-data.md` các field
này từ lâu chỉ còn là gợi ý hiển thị/snapshot tham khảo — không còn chặn quyết định PASS/FAIL nào. QC
tự chọn `result` hoàn toàn. Người dùng quyết định bỏ hẳn yêu cầu nhập liệu này, không chỉ nới lỏng
validation — cả tính năng tra cứu/khai báo bộ tiêu chuẩn lấy mẫu AQL không còn cần thiết cho nghiệp
vụ hiện tại.

## Quyết định

Xoá hoàn toàn khối AQL khỏi backend:

- Module `qc-aql` (master data `qc_aql_plans`/`qc_aql_rules`, CRUD `GET/POST/PATCH /qc-aql/plans`).
- `resolveAqlPlan()`, `resolveAqlResult()`, `AQL_LEVELS`, type `AqlPlan`
  (`src/api/iqc/iqc-aql.constant.ts`, `iqc-aql.query.ts`).
- 2 endpoint gợi ý `GET /iqc/aql-plan`, `GET /oqc/aql-plan`.
- Cột `inspectionLevel`/`aqlLevel`/`sampleSize`/`defectQty` trên `quality_inspections`; thêm
  `aqlPlanId`/`aqlRuleId`/`codeLetter`/`acceptanceNumber`/`rejectionNumber` trên
  `quality_inspection_results`.
- Enum `IqcInspectionLevel`/Postgres type `qc_inspection_level` (chỉ tồn tại để phục vụ AQL).
- Permission `qc-aql:read`/`qc-aql:create`/`qc-aql:update`.
- Error code `E200`, `E216`–`E219`, `E221`, `E222` — nghỉ hưu, không tái dùng số.

## Hệ quả — `result` OQC chuyển thành bắt buộc

`OqcService.buildOqcDecision()` trước đây dùng AQL plan để suy `resultAuto` (fallback khi
`result` không gửi) — mất fallback này vì bỏ AQL, nên `ConfirmOqcReqDto.result` đổi từ optional
sang **bắt buộc** (`result!`), giống IQC đã bắt buộc sẵn. Nhánh `E200` "thiếu cả `result` lẫn
`resultAuto`" không còn tồn tại — `ValidationPipe` tự chặn thiếu field ở tầng DTO.

## Không phục hồi được dữ liệu cũ

Toàn bộ dữ liệu AQL đã ghi trên `quality_inspection_results` (snapshot Ac/Re/`codeLetter` mỗi lần
IQC `confirm`) và trên `qc_aql_plans`/`qc_aql_rules` bị xoá cùng migration drop cột/bảng — không có
đường phục hồi ngoài backup DB thủ công trước khi áp migration.

## Đừng hoàn lại

Đừng thêm lại field AQL vào DTO confirm "cho chắc" — quyết định này là bỏ hẳn, không phải nới lỏng
tạm thời. Cần lại tính năng lấy mẫu AQL thì tham khảo lịch sử ở
`docs/decisions/qc-aql-master-data.md` (đã thay thế) trước khi thiết kế lại từ đầu.

## Related docs

`docs/decisions/qc-aql-master-data.md` — tính năng bị thay thế bởi quyết định này.
`docs/decisions/oqc-per-operation.md` — mục `resultAuto` (đã bỏ).
`docs/decisions/quality-schema-rename.md` — D6 (đảo ngược).
`docs/domains/quality-iqc.md`, `docs/domains/quality-oqc.md`, `docs/workflows/outgoing-qc.md`.
