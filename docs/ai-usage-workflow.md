# Quy trình sử dụng AI trong dự án

Bản chụp tại thời điểm 2026-07-13. Mô tả các bước thực tế đang dùng khi làm việc với Claude
Code trên repo này (không dùng Spec-Kit).

## Các lớp ngữ cảnh luôn được nạp sẵn

1. **`CLAUDE.md`** (gốc repo) — tổng quan dự án, lệnh hay dùng, kiến trúc, và `@import` các
   file rule bên dưới. AI đọc file này ở đầu mọi phiên.
2. **`.claude/rules/*.md`** — 5 file quy ước code (workflow, api-module, dto, database,
   errors-pagination), được `@import` từ `CLAUDE.md` nên luôn có sẵn, không cần gọi lệnh.
3. **`docs/features/*.md`** — spec nghiệp vụ ngắn theo từng tính năng (`users`, `auth`,
   `health`...), chỉ đọc khi động tới tính năng đó.

## Các bước khi thực hiện một yêu cầu

1. **Người dùng mô tả yêu cầu bằng tiếng Việt** trong chat (bug fix, tính năng mới, refactor,
   câu hỏi...).
2. **AI xác định loại việc**:
   - Câu hỏi/giải thích → trả lời trực tiếp, không sửa file.
   - Bug fix / refactor không đổi hành vi → sửa thẳng, không cần viết spec mới.
   - Tính năng mới hoặc thay đổi quy tắc nghiệp vụ không nhỏ → viết/cập nhật spec tại
     `docs/features/<feature>.md` (copy từ `_TEMPLATE.md`) **trước khi** code.
3. **Với thay đổi lớn/nhiều lựa chọn kỹ thuật** → dùng Plan Mode:
   - Khảo sát code liên quan (đọc file, `grep`, đôi khi giao việc cho Agent con).
   - Lên phương án, dùng `AskUserQuestion` để chốt các điểm còn mở (VD: chọn thư viện, phạm
     vi tính năng) — đây là bước "hỏi làm rõ" tương đương `speckit-clarify`, nhưng chỉ chạy
     khi thực sự cần, không phải bước bắt buộc cho mọi việc.
   - Ghi plan, chờ người dùng duyệt rồi mới triển khai.
   - **Với task khó** (nhiều rủi ro thiết kế, nhiều module liên quan, dễ sai nếu suy luận
     nông): dùng chế độ **Opus Plan Mode** — Plan Mode chạy trên model Opus (suy luận sâu
     hơn) cho giai đoạn khảo sát/lên kế hoạch, sau đó chuyển lại model thường (Sonnet) cho
     giai đoạn triển khai code. Cân bằng giữa chất lượng plan (việc dễ sai nhất, khó sửa nếu
     sai) và chi phí (việc triển khai theo plan đã chốt thì model thường vẫn đủ).
4. **Triển khai code** theo đúng quy ước trong `.claude/rules/` (controller/service mỏng,
   DTO chuẩn, `AppException` + `ErrorCode`, phân trang offset...).
5. **Kiểm tra trước khi coi là xong**: `pnpm lint`, `pnpm test` (file liên quan), đảm bảo
   `pnpm build` sạch. Với thay đổi schema: `db:generate` → `db:migrate` (không chạy trên
   DB dùng chung/prod nếu chưa được duyệt).
6. **Commit** (khi được yêu cầu): theo Conventional Commits (`feat:`, `fix:`, `refactor:`...),
   code/comment/commit message bằng tiếng Anh, trao đổi với người dùng bằng tiếng Việt.

## Đặc điểm chính

- Không có lệnh slash cố định phải gọi theo thứ tự — luồng làm việc linh hoạt theo loại việc,
  không phải pipeline ép buộc.
- Spec (`docs/features/`) chỉ viết khi cần (tính năng mới/thay đổi nghiệp vụ), bỏ qua với bug
  fix/refactor thuần túy — tránh viết tài liệu cho việc không cần.
- Việc "hỏi làm rõ" và "lên kế hoạch" là công cụ dùng khi cần (Plan Mode, `AskUserQuestion`),
  không phải bước bắt buộc cho mọi thay đổi — giữ chi phí thấp cho việc nhỏ, vẫn có công cụ
  cho việc lớn/nhiều rủi ro.
