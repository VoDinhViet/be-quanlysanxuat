---
name: domain-doc
description: Viết mới hoặc audit tài liệu nghiệp vụ (docs/domains/<domain>.md, docs/workflows/<flow>.md, docs/decisions/<slug>.md, docs/architecture.md) so với source thật trong src/api/ — business rule/bất biến/trình tự/ErrorCode có còn khớp code không, nội dung nằm đúng tầng chưa. Dùng khi người dùng nói "viết doc cho domain X", "refactor tài liệu", "dọn lại doc", hoặc một file docs/*.md nghi đã cũ.
argument-hint: "[domain|flow|decision]"
---

# Domain Doc

## When to use

- Viết mới hoặc dọn lại `docs/domains/<domain>.md` / `docs/workflows/<flow>.md`.
- Nghi một file doc đã lệch code (business rule đổi, `ErrorCode` mới, trình tự khác).
- Sau khi đổi business rule, thêm/xoá route, hoặc đổi ranh giới transaction.

**Không** dùng khi: chỉ cần tra route/field — Swagger `/api-docs` đã có, luôn khớp code, và repo
**không còn tầng doc theo module** (`docs/features/` đã xoá).

## Required context

Đọc trước khi bắt đầu — skill này cố ý **không** chép lại:

- `CLAUDE.md`, mục "Domain docs" — bốn tầng tài liệu và nội dung nào thuộc tầng nào. Phần lớn lỗi tài
  liệu trong repo này là nội dung nằm sai tầng.
- `.claude/rules/documentation.md` — ràng buộc bắt buộc khi ghi doc.
- File doc hiện tại của vùng đang đụng (nếu đã có).
- `src/api/<module>/` (controller, DTO, service), `src/database/schemas/`,
  `src/constants/error-code.constant.ts`, `src/constants/permission.constant.ts` — nguồn sự thật.

`$ARGUMENTS` = tên domain (`orders`, `production`, ...) hoặc tên flow (`stock-movement`, ...).
Không truyền gì → hỏi lại người dùng.

## Workflow

1. **Inspect** — xác định tầng đích: khái niệm/bất biến → `docs/domains/`; trình tự đầu-cuối →
   `docs/workflows/`; quan hệ xuyên module → `docs/architecture.md`; quyết định đảo chiều hoặc
   ranh giới phạm vi không domain nào sở hữu → `docs/decisions/`. Một domain gộp nhiều module
   (`product-structure` = products + boms + routing).
2. **Read** — đọc source của **mọi** module thuộc domain đó, không chỉ module vừa sửa.
3. **Đối chiếu** — liệt kê phát hiện, **chưa sửa gì**:
   - *Độ chính xác*: business rule trong doc vs điều service thực sự làm; `ErrorCode` được `throw`
     nhưng thiếu trong doc và ngược lại; `@Permissions` vs mô tả actor; giá trị enum trạng thái vs
     `src/database/schemas/` (enum đổi khá thường xuyên — luôn đọc giá trị thật, đừng tin mô tả).
   - *Cấu trúc*: nội dung thuộc tầng khác; lịch sử đổi lẫn vào mô tả hiện trạng; link chéo hỏng;
     bảng route/DTO chép tay (phải cắt, xem `.claude/rules/documentation.md`).
4. **Trình bày phát hiện cho người dùng trước khi ghi file** — kèm số dòng ở cả doc lẫn source.
   Không ghi hàng loạt khi chưa được xác nhận.
5. **Implement** — theo đúng khuôn của các file đang có: domain doc 9 mục, workflow doc 10 mục.
   Giữ nguyên phần đã đúng, chỉ sửa chỗ lệch.
6. **Validate + report** — chạy phần Validation dưới đây, rồi báo cáo ngắn gọn bằng tiếng Việt.

## Validation

Doc-only, không đụng code → không chạy `lint`/`build`. Kiểm ba thứ:

- Mọi đường dẫn `docs/...` nhắc tới đều trỏ tới file có thật.
- Mọi `ErrorCode`, route, permission viết trong doc đều `grep` ra được trong `src/`.
- Không có bảng route/DTO chép tay nào được thêm vào.

## Related docs

- `CLAUDE.md` — bản đồ bốn tầng tài liệu, bảng 24 module → domain.
- `.claude/rules/documentation.md` — nội dung nào phải nằm ở tầng nào.
- `.claude/README.md` — chuẩn viết `SKILL.md` của dự án.

## Ràng buộc

- Không tự commit — chỉ sửa file và báo cáo, trừ khi người dùng yêu cầu.
- Không đề xuất thêm field/endpoint mới vào code — skill này đối chiếu doc với code hiện có, không
  phải công cụ thiết kế API.
- Không tự sửa `docs/architecture.md` trong lượt chạy cho một domain cụ thể — chỉ báo cho người dùng.

> Áp dụng ý tưởng từ [luongnv89/claude-howto](https://github.com/luongnv89/claude-howto) (MIT License).
