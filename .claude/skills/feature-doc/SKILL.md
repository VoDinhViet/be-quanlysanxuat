---
name: feature-doc
description: Viết mới, tái cấu trúc, hoặc audit độ chính xác 1 file docs/features/<feature>.md so với source thật trong src/api/<feature>/ — route/permission/DTO field/ErrorCode có khớp code không, mục nào thiếu/thừa/lệch. Dùng khi người dùng nói "viết doc cho feature X", "refactor tài liệu", "dọn lại doc", hoặc một file docs/features/*.md nghi đã cũ/không còn khớp code.
argument-hint: "[feature]"
---

# Feature Doc (viết + audit docs/features/<feature>.md)

## Bối cảnh

`docs/features/<feature>.md` ghi lại business rules + API contract của 1 module (`.claude/rules/workflow.md`). **Không có khung/template cố định** — mỗi feature khác nhau về độ phức tạp, mục nào cần thì viết, không cần thì bỏ. Bất biến/quan hệ **bắc cầu nhiều module** (cách 2 bảng nối nhau, thứ tự ghi qua nhiều service) thuộc về `docs/architecture.md`, không lặp lại ở từng feature doc — nếu phát hiện một feature doc đang cõng loại nội dung này, đề xuất chuyển sang đó.

Swagger UI (`/api-docs`, tự sinh từ `@ApiAuth`/`@ApiPublic`) đã cho interactive reference đầy đủ mọi field/type — skill này không sinh lại OpenAPI spec, mà lo phần Swagger không có: business rules, quyết định thiết kế, error case theo `ErrorCode`, và độ khớp giữa doc tay-viết với code thật.

## Input

- `$ARGUMENTS` — tên feature (`boms`, `orders`, `production-jobs`...) ứng với `docs/features/<feature>.md` (hoặc file gộp như `master-data.md`/`production.md` nếu feature đó không có file riêng) và `src/api/<feature>/`. Có thể liệt kê nhiều feature cách nhau bởi dấu phẩy.
- Nếu không truyền gì: hỏi lại người dùng feature nào cần xử lý.

## Việc cần làm

1. **File chưa tồn tại (viết mới)**: đọc `src/api/<feature>/` (controller, DTO, service, `ErrorCode` liên quan) để nắm route/permission/field/error thật, rồi soạn nội dung phù hợp — thường gồm: mục đích feature, business rules (validation, cross-field, computed field), API contract (bảng gọn `Method | Path | Auth | Request | Response`), error cases (`ErrorCode` nào ứng với case nào). Chỉ thêm "Frontend integration notes"/"Thay đổi phá vỡ gần nhất" nếu feature có breaking change đang hiệu lực cần ghi lại (hợp đồng hiện hành, không phải nhật ký mọi lần đổi — xem mục 4); chỉ thêm "Ngoài phạm vi" nếu thật sự có ranh giới cần làm rõ.

2. **File đã tồn tại (refactor + audit, làm cùng một lượt)**: đọc file hiện tại, đối chiếu với `src/api/<feature>/` thật, liệt kê phát hiện (KHÔNG tự sửa ở bước này) — cả hai loại lệch dưới đây cùng lúc, không tách 2 lượt:
   - **Cấu trúc (macro)**: tên gọi/thuật ngữ cũ còn sót (không khớp tên bảng/cột hiện tại trong `src/database/schemas/`); mục đang có nhưng mô tả tính năng đã bị bỏ, hoặc thiếu mục quan trọng đang cần; link chéo hỏng (trỏ tới file/mục không còn tồn tại — kiểm cả `docs/architecture.md` và các file `docs/features/*.md` khác); nội dung bắc cầu nhiều module lẽ ra thuộc `docs/architecture.md`; cấu trúc khó theo dõi (business rule lẫn vào API contract, lịch sử đổi nhiều lần lẫn vào mô tả trạng thái hiện tại).
   - **Độ chính xác (micro)**: route có trong controller nhưng chưa có dòng trong bảng API contract (hoặc ngược lại — route đã xoá nhưng doc còn ghi); `@Permissions('resource:action')` không khớp cột "Auth"; field DTO required/optional không khớp mô tả "Request"; `ErrorCode` được `throw` trong service nhưng chưa xuất hiện ở "Trường hợp lỗi", hoặc ngược lại.

3. **Trình bày phát hiện/bản nháp cho người dùng trước khi ghi file** — liệt kê cụ thể theo mục/dòng, kèm số dòng trong cả doc và source khi audit độ chính xác. Không tự động ghi hàng loạt khi chưa được xác nhận.

4. **Sau khi được duyệt, ghi/sửa file.** Với file refactor: giữ nguyên nội dung nghiệp vụ đã đúng, chỉ sửa cấu trúc/tên gọi/mục lệch — không viết lại toàn bộ nếu không cần. "Frontend integration notes" ghi **hợp đồng hiện hành** (field/route đang có, request/response shape hiện tại) — không phải chuỗi diff qua từng lần đổi; lịch sử đầy đủ nằm trong `git log`, không lặp lại trong doc.

5. **Báo cáo kết quả** ngắn gọn bằng tiếng Việt: file nào đã tạo/sửa, thay đổi gì.

## Ràng buộc

- Không tự ý commit — chỉ sửa file và báo cáo, trừ khi người dùng yêu cầu commit.
- Không đề xuất thêm field/endpoint mới vào code — skill này chỉ đối chiếu doc với code hiện có, không phải công cụ thiết kế API.
- `docs/architecture.md` **nằm trong phạm vi** khi một feature doc đang lặp lại nội dung của nó (đề xuất cắt, trỏ sang đó) — nhưng không tự sửa `docs/architecture.md` trong lượt chạy cho một feature cụ thể, chỉ báo cho người dùng.

> Áp dụng ý tưởng từ [luongnv89/claude-howto](https://github.com/luongnv89/claude-howto) (MIT License).
