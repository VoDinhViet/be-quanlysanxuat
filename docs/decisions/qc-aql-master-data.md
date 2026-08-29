# Bảng AQL chuyển từ hardcode sang master data (`qc_aql_plans`/`qc_aql_rules`)

**Trạng thái:** còn hiệu lực

## Bối cảnh

Trước đợt này, toàn bộ dữ liệu tra AQL (ANSI/ASQ Z1.4) nằm cứng trong code —
`src/api/iqc/iqc-aql.constant.ts`, hai hằng số `LOT_SIZE_CODE_LETTER` (lot size × inspection level →
code letter) và `SAMPLING_PLAN` (code letter × AQL level → sample size/Ac/Re). File này tự mang một
cảnh báo: bảng do tự điền lại từ kiến thức chuẩn, không tra trực tiếp bản giấy gốc, "BẮT BUỘC QC/kỹ
thuật đối chiếu từng ô... và ký duyệt trước khi coi là số liệu go-live" — nhưng không có cách nào để
QC thực sự sửa nó ngoài việc nhờ dev đổi code + deploy lại.

## Quyết định

Chuyển 2 hằng số đó thành 2 bảng: `qc_aql_plans` (một cặp inspection level × AQL level của một tiêu
chuẩn) và `qc_aql_rules` (các dải lot size của một plan, giữ `codeLetter`/`sampleSize`/
`acceptanceNumber`/`rejectionNumber`). Seed một lần từ đúng nội dung 2 hằng số cũ
(`src/database/seeds/qc-aql.seed.ts`) để không đổi hành vi ngay lúc migrate, rồi QC/kỹ thuật sửa qua
module `qc-aql` mới (`GET`/`POST /qc-aql/plans`, `PATCH /qc-aql/plans/:planId` — CRUD tối thiểu,
chưa có `DELETE`).

`resolveAqlPlan()` chuyển từ hàm thuần (`src/api/iqc/iqc-aql.constant.ts`) sang hàm đọc DB
(`src/api/iqc/iqc-aql.query.ts`, nhận `Database | DbTransaction`, `async`). `AQL_LEVELS` (dùng cho
validate DTO) và `resolveAqlResult()` (so `defectQty` với `ac`, thuần) giữ nguyên ở
`iqc-aql.constant.ts` — hai hằng số bảng lấy mẫu là phần duy nhất chuyển sang DB.

## Rủi ro tạm thời lúc mới làm, nay đã đóng — snapshot trên `qc_inspections`

Bản đầu của quyết định này chấp nhận một khoảng hở tạm thời: `IqcService.getIqc`/`OqcService.getOqc`
tính `ac`/`re` **lúc đọc** (`resolveAqlPlan` mỗi lần `GET`) vì bảng lúc đó (case row, nay
`quality_inspections`) là 1-dòng-1-lô, không có chỗ tự nhiên để snapshot theo từng lần kiểm — sửa
một `qc_aql_rules` sẽ đổi luôn `ac`/`re` hiển thị của mọi lần kiểm cũ đã tra theo rule đó, kể cả lần
đã `COMPLETED`. Đóng lại ngay trong đợt tách case row/attempt row (`docs/decisions/qc-data-model.md`,
nay `quality_inspections`/`quality_inspection_results` — `docs/decisions/quality-schema-rename.md`):
mỗi dòng attempt (`quality_inspection_results`, một lần kiểm) lưu thật `aqlPlanId`/`aqlRuleId`/
`codeLetter`/`acceptanceNumber`/`rejectionNumber` lúc tạo, không tính lại lúc đọc — `IqcService.getIqc`
nay đọc `ac`/`re`/`codeLetter` từ attempt mới nhất để trả trong response. `OqcService.getOqc` ghi
snapshot y hệt lúc `confirmOqc`, nhưng không còn expose `ac`/`re`/`codeLetter` ở `OqcResDto` — FE tra
sống qua `GET /oqc/aql-plan` thay vì đọc số đã đóng băng trên response chi tiết. Dù vậy, sửa rule vẫn
chỉ ảnh hưởng lần kiểm tạo **sau** thời điểm sửa cho cả hai module, vì snapshot nằm nguyên trên
`quality_inspection_results`.

## Known gap: không chặn overlap lot size bằng DB

Hai rule cùng plan có dải `[lotSizeMin, lotSizeMax]` giao nhau lẽ ra cần `EXCLUDE USING gist` —
`drizzle-orm` (bản đang dùng) không có builder cho ràng buộc này, và không được sửa tay file migration
ngoại trừ data migration (`.claude/rules/database.md`). Chốt bằng unique `(aqlPlanId, lotSizeMin)`
(chặn trùng đúng điểm bắt đầu, không chặn overlap thật) + `QcAqlService` validate overlap ở tầng
service trước khi ghi (`E218`). TOCTOU giữa validate và insert vẫn còn (không transaction-level
serializable) — chấp nhận, cùng mức rủi ro với các `validateXUniqueness` khác trong repo
(`.claude/rules/transactions.md`).

## Related docs

`docs/domains/quality-iqc.md` — mục "Lưu kết quả QC IQC" và "AQL auto-suggest" đọc nguồn mới.
`docs/decisions/qc-data-model.md` — bảng `quality_inspection_results` đóng khoảng hở snapshot ở
trên. `docs/decisions/quality-schema-rename.md` — bảng đổi tên `qc_requests`/`qc_inspections` →
`quality_inspections`/`quality_inspection_results`.
