---
description: Update the "Frontend integration notes" section in the affected docs/features/<feature>.md after an API-facing change
---

# Frontend Integration Notes

## Bối cảnh

Repo này có quy ước ghi trong `.claude/rules/workflow.md`: mỗi `docs/features/<feature>.md` kết thúc bằng mục `## Frontend integration notes` (khung mẫu ở `docs/features/_TEMPLATE.md`), tóm tắt cho frontend những gì cần biết để ghép nối sau một thay đổi API.

## Input

- `$ARGUMENTS` — tùy chọn: tên feature (`auth`, `users`, ...) hoặc một commit/range cụ thể để soi thay đổi.
- Nếu không truyền gì: mặc định soi diff hiện tại chưa commit (`git status` + `git diff`).

## Việc cần làm

1. **Xác định phạm vi ảnh hưởng**
   Từ diff (hoặc `$ARGUMENTS`), liệt kê những thay đổi chạm tới controller, DTO, response shape, error code, hoặc auth guard — và feature nào tương ứng.

2. **Với mỗi feature bị ảnh hưởng có file `docs/features/<feature>.md`:**
   - Nếu file chưa có mục `## Frontend integration notes`, thêm vào cuối file đúng theo khung ở `_TEMPLATE.md`.
   - **Chỉ ghi phần ảnh hưởng tới người tiêu thụ API**, ví dụ:
     - field bị đổi tên / xóa / thêm mới bắt buộc
     - response shape đổi
     - error code mới hoặc đổi ý nghĩa
     - auth requirement đổi (public ↔ jwt)
     - path/method đổi
   - **Không ghi** chi tiết implementation nội bộ (tên biến, thuật toán hash, cấu trúc DB...).
   - Breaking change → gắn ngày theo format: `**Breaking change (YYYY-MM-DD)**: ...` (lấy ngày hiện tại từ context hệ thống, không tự bịa).
   - Không có gì ảnh hưởng tới FE (refactor nội bộ, bug fix không đổi contract) → không thêm dòng mới; giữ nguyên hoặc thêm dòng `No breaking changes as of YYYY-MM-DD` nếu mục đang trống.
   - Feature liên quan chưa có file spec → báo cho người dùng, không tự bịa file mới ngoài phạm vi yêu cầu.

3. **Báo cáo kết quả**
   Trả lời ngắn gọn bằng tiếng Việt: liệt kê đúng nội dung đã ghi vào mục Frontend integration notes cho từng file, để người dùng copy gửi thẳng cho đội frontend.

## Ràng buộc

- Không tự ý commit — chỉ sửa file và báo cáo, trừ khi người dùng yêu cầu commit.
