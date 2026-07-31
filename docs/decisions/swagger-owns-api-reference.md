# Swagger là nguồn reference API, không viết tay

**Trạng thái:** còn hiệu lực · **Thay thế:** tầng `docs/features/` (đã xoá)

## Bối cảnh

Repo từng có 13 file `docs/features/<module>.md`, mỗi file mở đầu bằng một bảng
`Method | Path | Auth | Request | Response` viết tay. Ba đợt audit liên tiếp cho thấy **bảng chép
tay là nguồn sai lớn nhất trong toàn bộ tài liệu**: route đổi tên, permission đổi, DTO thêm field —
bảng không đổi theo, và không có cách nào phát hiện tự động.

87 handler đã được `@ApiAuth`/`@ApiPublic` mô tả đầy đủ; Swagger sinh ra từ chính chúng nên **không
thể stale**.

## Quyết định

1. **Không viết tay bảng route/DTO trong bất kỳ file doc nào.** Reference mức route/field đọc ở
   Swagger UI `/api-docs`.
2. **Xoá hẳn tầng `docs/features/`** (13 file, 1.353 dòng). Nội dung nghiệp vụ đã chuyển lên
   `docs/domains/`; trình tự chạy chuyển sang `docs/workflows/`.
3. `ErrorCode` không có tầng doc riêng — tên mã đã tự mô tả
   (`stock_receipt.error.line_target_mismatch`), thứ tự kiểm đọc thẳng từ service.

## Hệ quả

- Doc viết tay chỉ còn ghi **thứ Swagger không thể hiện được**: ngữ nghĩa (replace-all vs partial),
  thứ tự kiểm lỗi, ràng buộc ngầm, route nào **thực sự** public.
- Một module mới **không** cần file doc riêng. Xem `.claude/skills/new-api-module/SKILL.md`.
- Muốn đọc lại nội dung đã xoá: `git checkout fb37682 -- docs/features/`.

## Cảnh báo còn hiệu lực

`@Permissions()` đứng dưới `@ApiPublic()` vẫn **hiện trong Swagger** dù hoàn toàn không được thực
thi — Swagger đúng về hình dạng request, không đúng về việc route có được bảo vệ hay không. Xem
`docs/domains/identity-access.md`.
