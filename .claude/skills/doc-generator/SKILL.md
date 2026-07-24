---
name: doc-generator
description: Đối chiếu bảng "API contract"/"Error cases" trong docs/features/<feature>.md với controller/DTO/ErrorCode thật trong src/api/<feature>/ — phát hiện route thiếu, field DTO không khớp, error code chưa liệt kê. Dùng sau khi thêm/sửa endpoint mà chưa chắc doc đã cập nhật đủ.
argument-hint: "[feature]"
---

# Doc Generator (API contract accuracy audit)

## Bối cảnh

`docs/features/<feature>.md` là tài liệu **hand-written** (không tự sinh từ Swagger, không theo khung cố định — xem skill `doc-refactor`) — thường có bảng API contract dạng gọn `Method | Path | Auth | Request | Response`. Swagger UI (`/api-docs`, tự sinh từ `@ApiAuth`/`@ApiPublic`) đã cho interactive reference đầy đủ mọi field/type — skill này **không** sinh lại OpenAPI spec (thừa), mà audit xem bảng tay-viết trong `docs/features/*.md` có còn khớp code thật hay không.

Đây là audit **micro-level** (đối chiếu từng route/field/error code với source). Việc tái cấu trúc mục/thứ tự trong file (macro-level) là việc của skill `doc-refactor` — chạy `doc-refactor` trước nếu file đang thiếu hẳn mục nào đó.

## Input

- `$ARGUMENTS` — tên feature (`boms`, `orders`, `employees`...), ứng với cả `docs/features/<feature>.md` và `src/api/<feature>/`.
- Nếu không truyền gì: hỏi lại người dùng feature nào cần audit (tránh quét toàn repo một cách vô ích, quy mô file DTO/controller mỗi module không nhỏ).

## Việc cần làm

0. **`docs/features/<feature>.md` chưa tồn tại?** (hiện tại thư mục này đang trống — mọi feature đều ở trạng thái này cho tới khi được viết) → dừng, báo cho người dùng và gợi ý chạy skill `doc-refactor` trước (nó đọc source rồi soạn nội dung mới) — `doc-generator` chỉ audit đối chiếu, không tự viết file từ đầu.
1. **Đọc bảng API contract** trong `docs/features/<feature>.md`.
2. **Đọc source thật**: `src/api/<feature>/<feature>.controller.ts` (route, method, `@Permissions`/`@ApiPublic`), `dto/*.req.dto.ts`/`*.res.dto.ts` (field nào required/optional, kiểu dữ liệu), và mọi `AppException(ErrorCode.Exxx, ...)` trong `<feature>.service.ts`.
3. **Đối chiếu, liệt kê lệch** (không tự sửa ở bước này):
   - Route có trong controller nhưng chưa có dòng trong bảng API contract (hoặc ngược lại — route đã xoá nhưng doc còn ghi).
   - `@Permissions('resource:action')` trên route không khớp cột "Auth" ghi trong doc.
   - Field DTO required/optional không khớp mô tả "Request" (vd doc ghi field bắt buộc nhưng DTO dùng `*FieldOptional`).
   - `ErrorCode` được `throw` trong service nhưng chưa xuất hiện ở mục "Error cases" của doc, hoặc ngược lại (liệt kê trong doc nhưng không còn được throw ở đâu).
4. **Trình bày phát hiện cho người dùng trước khi sửa** — liệt kê theo route/field cụ thể, kèm số dòng trong cả doc và source.
5. **Sau khi được duyệt, cập nhật bảng** trong `docs/features/<feature>.md` — giữ đúng format gọn (`Method | Path | Auth | Request | Response` cho API contract; `Case | ErrorCode | HTTP status` cho Error cases), không chuyển sang dạng verbose per-endpoint (spec/curl example) — Swagger đã lo phần đó.
6. **Báo cáo kết quả** ngắn gọn bằng tiếng Việt.

## Ràng buộc

- Không tự ý commit — chỉ sửa file và báo cáo, trừ khi người dùng yêu cầu commit.
- Không đề xuất thêm field/endpoint mới vào code — skill này chỉ đối chiếu doc với code hiện có, không phải công cụ thiết kế API.

> Áp dụng ý tưởng từ [luongnv89/claude-howto](https://github.com/luongnv89/claude-howto) (MIT License).
