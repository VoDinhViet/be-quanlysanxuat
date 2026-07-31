---
name: new-api-module
description: Trình tự đầy đủ khi thêm một module API mới dưới src/api/ (hoặc thêm bảng + route + quyền mới vào module đã có) — schema, migration, controller/service/DTO, đăng ký app.module.ts, ErrorCode, PERMISSION_CODES, seed quyền, doc. Dùng khi người dùng nói "thêm module X", "làm CRUD cho X", "thêm bảng X kèm API", hoặc khi một feature mới cần cả bảng lẫn endpoint.
argument-hint: "[module]"
---

# New API Module

Bốn bước cuối (`ErrorCode`, `PERMISSION_CODES`, seed quyền, doc) là chỗ hay quên nhất, và quên thì
**fail lặng lẽ lúc chạy** chứ không lỗi biên dịch. Skill này tồn tại vì **thứ tự**, không phải vì
convention — convention đã nằm ở `.claude/rules/`.

## When to use

- Thêm một module mới dưới `src/api/`.
- Thêm một bảng mới kèm route vào module đã có.
- Thêm một permission mới cho bất kỳ route nào.

**Không** dùng khi: chỉ sửa logic trong service/DTO có sẵn, hoặc chỉ đổi schema mà không thêm route.

## Required context

Đã `@import` sẵn vào mọi phiên, đọc lại đúng mục khi tới bước tương ứng — skill này cố ý **không**
chép lại:

- `.claude/rules/database.md` — quy ước schema, soft delete, thứ tự generate/migrate.
- `.claude/rules/api.md` — controller + DTO: decorator, `@Permissions`, `@Expose()`.
- `.claude/rules/service.md` — query, ghi, `AppException`, phân trang, transaction.
- `.claude/rules/documentation.md` — viết doc trước, tầng nào chứa gì.
- `.claude/rules/general.md` — không chạy test, không tự commit, không tự migrate.
- `.claude/rules/security.md` — route nào được public, permission phải khai ở đâu.

Đọc thêm theo vùng nghiệp vụ đang đụng: `docs/domains/<domain>.md`, và
`docs/workflows/<flow>.md` nếu module tham gia một luồng đầu-cuối.

Module tham chiếu cho code mới: `src/api/users/`.

## Workflow

1. **Doc trước.** Xác định domain, cập nhật `docs/domains/<domain>.md` nếu có khái niệm/bất biến
   mới. Chạm ≥ 2 module → `docs/architecture.md`. Là luồng đầu-cuối → `docs/workflows/<flow>.md`.
   Không có tầng doc theo module — reference route/DTO là Swagger.
2. **Schema.** `src/database/schemas/<module>.ts`, rồi **re-export từ
   `src/database/schemas/index.ts`** — `drizzle-kit` chỉ đọc file này, quên là migration ra rỗng mà
   không báo lỗi.
3. **Migration.** `pnpm db:generate`, **đọc file SQL sinh ra**, rồi `pnpm db:migrate`.
   ⚠️ `DATABASE_URL` trong `.env` trỏ DB dùng chung từ xa — **xin phép người dùng trước khi
   migrate**, không tự chạy.
4. **Module.** `src/api/<module>/` gồm `<module>.module.ts`, `.controller.ts`, `.service.ts`,
   `dto/`. Theo khuôn `src/api/users/`.
5. **Đăng ký** `<Module>Module` vào mảng `imports` của `src/app.module.ts` — thiếu bước này thì
   route không tồn tại, không có cảnh báo nào.
6. **`ErrorCode`.** Mọi mã mới thêm vào `src/constants/error-code.constant.ts` (`Vxxx` validation /
   `Exxx` domain). Không hardcode message ở chỗ `throw`.
7. **Permission.** Thêm chuỗi `resource:action` vào `PERMISSION_CODES`
   (`src/constants/permission.constant.ts`) **và** cấp cho các role liên quan trong
   `src/database/seeds/credentials.seed.ts`. Thiếu một trong hai → route chặn im lặng mọi người trừ
   `ADMIN`.
8. **Đối chiếu lại doc** ở bước 1 với code vừa viết (route, permission, `ErrorCode` có khớp không) —
   dùng skill `domain-doc` nếu cần audit kỹ.

## Validation

```bash
pnpm lint
npx tsc --noEmit
pnpm build
```

Chạy **một lần** ở cuối, không sau mỗi sửa nhỏ. **Không** chạy `pnpm test*`
(`docs/decisions/testing-paused.md`).

Kiểm thêm bằng tay:

- `GET /api-docs` hiện đủ route mới, đúng auth (`@ApiAuth` vs `@ApiPublic`).
- Mọi permission mới có mặt ở **cả** `PERMISSION_CODES` lẫn `credentials.seed.ts`.
- Migration mới đã nằm trong `drizzle/` và `drizzle/meta/_journal.json`.

## Related docs

- `CLAUDE.md` — bảng 24 module, request pipeline, bản đồ tài liệu.
- `docs/domains/identity-access.md` — cách guard + permission thực sự hoạt động.
- `docs/architecture.md` — sơ đồ ER, thứ tự ghi xuyên module.
