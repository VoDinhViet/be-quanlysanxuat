---
name: doc-refactor
description: Viết mới hoặc tái cấu trúc/dọn 1 file docs/features/<feature>.md — không theo khung cố định, tự điều chỉnh mục theo nội dung feature đó thực sự cần. Dùng khi người dùng nói "refactor tài liệu", "dọn lại doc", "viết doc cho feature X", hoặc một file docs/features/*.md đã cũ/không còn khớp code.
argument-hint: "[feature]"
---

# Doc Refactor

## Bối cảnh

`docs/features/<feature>.md` ghi lại business rules + API contract của 1 module (`.claude/rules/workflow.md`). **Không có khung/template cố định** — mỗi feature khác nhau về độ phức tạp, mục nào cần thì viết, không cần thì bỏ (vd 1 module master-data đơn giản không cần mục "Frontend integration notes" nếu chưa từng có breaking change). Tự điều chỉnh cấu trúc theo đúng nội dung feature đó cần trình bày, không rập khuôn.

Skill này lo phần **cấu trúc/tổ chức/rõ ràng** (macro-level) — mục nào nên có, thứ tự đọc có hợp lý không, tên gọi có nhất quán với code hiện tại không. Việc đối chiếu chi tiết route/field/error code với source thật là việc của skill `doc-generator` — nếu người dùng cần cả 2, chạy `doc-refactor` trước (dựng khung nội dung) rồi `doc-generator` sau (kiểm độ chính xác).

## Input

- `$ARGUMENTS` — tên feature (`boms`, `orders`, `employees`...) ứng với `docs/features/<feature>.md` và `src/api/<feature>/`. Có thể liệt kê nhiều feature cách nhau bởi dấu phẩy.
- Nếu không truyền gì: hỏi lại người dùng feature nào cần xử lý.

## Việc cần làm

1. **File chưa tồn tại (viết mới)**: đọc `src/api/<feature>/` (controller, DTO, service, `ErrorCode` liên quan) để nắm route/field/error thật, rồi soạn nội dung phù hợp — thường gồm: mục đích feature, business rules (validation, cross-field, computed field), API contract (bảng gọn `Method | Path | Auth | Request | Response`), error cases (`ErrorCode` nào ứng với case nào). Chỉ thêm mục "Frontend integration notes" nếu feature có breaking change cần ghi lại; chỉ thêm "Out of scope" nếu thật sự có ranh giới cần làm rõ (tránh nhầm sang phạm vi khác) — không thêm mục rỗng cho đủ bộ.

2. **File đã tồn tại (refactor)**: đọc file hiện tại, đối chiếu nhanh với code trong `src/api/<feature>/`, liệt kê phát hiện (KHÔNG tự sửa ở bước này):
   - Tên gọi/thuật ngữ cũ còn sót (không khớp tên bảng/cột hiện tại trong `src/database/schemas/`) — ví dụ thật: `employees.md` (trước khi bị xoá) từng dùng "account" thay vì "credential", phải sửa lại cho khớp schema `credentials`.
   - Mục đang có nhưng không còn cần thiết (mô tả tính năng đã bị bỏ), hoặc thiếu mục quan trọng mà nội dung thực tế đang cần (vd có breaking change gần đây nhưng chưa ghi vào "Frontend integration notes").
   - Link chéo hỏng (trỏ tới file/mục không còn tồn tại).
   - Cấu trúc khó theo dõi (mục đặt sai chỗ, business rule lẫn vào API contract...).

3. **Trình bày phát hiện/bản nháp cho người dùng trước khi ghi file** — liệt kê cụ thể theo mục/dòng. Không tự động ghi hàng loạt khi chưa được xác nhận (tương tự nguyên tắc "xin duyệt trước khi sửa lớn" của refactor code — xem skill `code-refactor`).

4. **Sau khi được duyệt, ghi/sửa file.** Với file refactor: giữ nguyên nội dung nghiệp vụ đã đúng, chỉ sửa cấu trúc/tên gọi/mục lệch — không viết lại toàn bộ nếu không cần.

5. **Báo cáo kết quả** ngắn gọn bằng tiếng Việt: file nào đã tạo/sửa, thay đổi gì.

## Ràng buộc

- Không tự ý commit — chỉ sửa file và báo cáo, trừ khi người dùng yêu cầu commit.
- Không đụng `docs/architecture.md` — khác shape (ER/data-flow, không có business rules/API contract), không thuộc phạm vi skill này.

> Áp dụng ý tưởng từ [luongnv89/claude-howto](https://github.com/luongnv89/claude-howto) (MIT License).
