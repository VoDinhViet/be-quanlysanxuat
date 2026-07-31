---
name: feature-doc
description: Viết mới, tái cấu trúc, hoặc audit độ chính xác tài liệu của 1 module/domain (docs/features/<module>.md và docs/domains/<domain>.md) so với source thật trong src/api/ — route/permission/DTO field/ErrorCode có khớp code không, nội dung nằm đúng tầng chưa, mục nào thiếu/thừa/lệch. Dùng khi người dùng nói "viết doc cho feature X", "refactor tài liệu", "dọn lại doc", hoặc một file docs/*.md nghi đã cũ/không còn khớp code.
argument-hint: "[feature]"
---

# Feature Doc (viết + audit tài liệu một module/domain)

## Bối cảnh

Tài liệu chia **ba tầng**, và phần lớn lỗi tài liệu trong repo này là nội dung nằm sai tầng:

| Tầng | File | Chứa gì |
| --- | --- | --- |
| Xuyên module | `docs/architecture.md` | Sơ đồ ER, thứ tự ghi qua nhiều module |
| Domain ("tại sao") | `docs/domains/<domain>.md` | Khái niệm, vòng đời, business rule, bất biến, phụ thuộc chéo domain, common mistakes |
| Module (chi tiết) | `docs/features/<module>.md` | Quy tắc cụ thể của module, ngữ nghĩa endpoint (replace-all, partial, bất biến sau tạo), bảng error code + thứ tự kiểm |

**Không liệt kê bảng route/DTO trong `docs/features/`** — Swagger UI (`/api-docs`) tự sinh từ `@ApiAuth`/`@ApiPublic` và luôn khớp code; bảng chép tay là nguồn stale lớn nhất từng thấy trong repo này. Chỉ ghi thứ **không đọc được từ signature**: ngữ nghĩa, thứ tự kiểm lỗi, ràng buộc ngầm, route nào thực sự public.

Sáu domain: `orders`, `production`, `inventory`, `product-structure`, `identity-access`, `partners`. Một domain gộp nhiều module (ví dụ `product-structure` = products + boms + routing + operations).

**Không có khung cố định cho tầng module** — mục nào cần thì viết. Tầng domain thì theo khuôn: Purpose / Core concepts / Entities / Lifecycle / Business rules / Invariants / Cross-domain dependencies / Common mistakes / Related docs.

Swagger UI (`/api-docs`, tự sinh từ `@ApiAuth`/`@ApiPublic`) đã cho interactive reference đầy đủ mọi field/type — skill này không sinh lại OpenAPI spec, mà lo phần Swagger không có: business rules, quyết định thiết kế, error case theo `ErrorCode`, và độ khớp giữa doc tay-viết với code thật.

## Input

- `$ARGUMENTS` — tên feature (`boms`, `orders`, `production-jobs`...) ứng với `docs/features/<feature>.md` (hoặc file gộp như `master-data.md`/`production.md` nếu feature đó không có file riêng) và `src/api/<feature>/`. Có thể liệt kê nhiều feature cách nhau bởi dấu phẩy.
- Nếu không truyền gì: hỏi lại người dùng feature nào cần xử lý.

## Việc cần làm

1. **File chưa tồn tại (viết mới)**: đọc `src/api/<feature>/` (controller, DTO, service, `ErrorCode` liên quan) để nắm route/permission/field/error thật, rồi soạn nội dung phù hợp — thường gồm: mục đích, business rules (validation, cross-field, computed field), ngữ nghĩa endpoint đáng ghi (replace-all vs partial, field bất biến sau tạo, route nào thực sự public), và bảng error case (`ErrorCode` nào ứng với case nào, kèm thứ tự kiểm). **Không chép bảng route/DTO** — xem mục "Bối cảnh". Chỉ thêm "Thay đổi phá vỡ gần nhất" nếu có breaking change đang hiệu lực (hợp đồng hiện hành, không phải nhật ký mọi lần đổi); chỉ thêm "Ngoài phạm vi" nếu thật sự có ranh giới cần làm rõ.

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
