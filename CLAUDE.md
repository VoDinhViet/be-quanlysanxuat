# CLAUDE.md

Hướng dẫn cho Claude Code khi làm việc trong repo này.

## Stack

NestJS 11 modular monolith cho hệ thống quản lý sản xuất ("quản lý sản xuất"). PostgreSQL + Drizzle
ORM, Redis, Swagger UI ở `/api-docs` (ngoài production). Package manager là **pnpm**. Env nạp từ
`.env.${NODE_ENV}` trước, `.env` sau (`src/main.ts` + các seed script). Cần Postgres + Redis đang
chạy. `package.json` vẫn tên `be-giasu-ai` — chưa đổi tên cho dự án này.

## Rules

Quy ước bắt buộc cho gần như mọi task, luôn nạp qua `@import`:

@.claude/rules/workflow.md
@.claude/rules/api-module.md
@.claude/rules/dto.md
@.claude/rules/code-docs.md
@.claude/rules/database.md

Ba rule sau **không** import — chỉ đọc khi rơi đúng tình huống, mỗi rule có 1 dòng trỏ tới nó nằm
ngay trong rule đã import quản lý khoảnh khắc đó: `.claude/rules/transactions.md` (từ `api-module.md`,
mục Services), `.claude/rules/seeds.md` (từ `database.md`, mục Seeds), `.claude/rules/testing.md`
(testing đang tạm dừng, xem Standing decisions bên dưới).

Skill (quy trình rời rạc, tự chọn lúc dùng) sống ở `.claude/skills/`, chuẩn đặt ở `.claude/README.md`.

## Commands

```bash
pnpm start:dev                    # dev server watch, cổng mặc định 3000, api ở /api
pnpm build / lint / format

pnpm db:generate                  # sinh migration từ thay đổi schema
pnpm db:migrate                   # áp migration — không chạy vào DB dùng chung/prod khi chưa được duyệt
pnpm db:studio

pnpm db:seed:<name>                # credentials, client-groups, clients, countries, units,
                                    # material-groups, materials, supplier-groups, suppliers,
                                    # product-groups, products, operations — xem package.json
```

## Request pipeline

Cấu hình ở `src/main.ts`. Prefix toàn cục `api` + URI versioning (`/api/v1/...` khi controller khai
version) — `GET /` và `GET /health` bị loại khỏi prefix (`app.setGlobalPrefix('api', { exclude })`)
nên health check nằm ở `/health`, không phải `/api/health`. `ValidationPipe` toàn cục
(`whitelist: true`, `transform: true`, lỗi validate trả 422). `ClassSerializerInterceptor` +
`GlobalExceptionFilter` toàn cục.

**Guard mặc định an toàn**: `JwtAuthGuard` rồi `PermissionsGuard` đăng ký `APP_GUARD` trong
`src/app.module.ts`, theo đúng thứ tự đó. Mọi route mặc định cần bearer token hợp lệ; đánh dấu
`@Public()`/`@ApiPublic()` để bỏ qua cả hai. Route khai quyền cần bằng `@Permissions('resource:action')`,
`PermissionsGuard` enforce nó — role có `system:manage` qua mọi kiểm tra. `@CurrentUser()` trả
`undefined` trên route `@Public()`. `main.ts` export một handler kiểu serverless (cached Express
instance) và cũng `listen(PORT)` khi chạy trực tiếp.

## Modules

24 module dưới `src/api/`. `users` là module tham chiếu cho code mới (controller/service, DTO, lỗi,
phân trang — chi tiết ở `.claude/rules/`). Đăng ký module mới trong `src/app.module.ts`. Cột `Spec`
là tên file dưới `docs/features/`, `—` nghĩa là chưa có.

| Module | Spec | Ghi chú |
| --- | --- | --- |
| `auth` | — | login/refresh/logout; `guards/permissions.guard.ts` sống ở đây |
| `users` | users | module tham chiếu |
| `roles` | roles | chỉ đọc (`GET /roles`) |
| `health` | — | `GET /health`, ngoài prefix `api` |
| `files` | files | registry file dùng chung — mọi đính kèm trỏ vào đây, không phải URL trần |
| `clients` | clients | contact là xoá+chèn lại toàn bộ mỗi lần sửa — id contact không ổn định |
| `client-groups` | master-data | |
| `products` | products | `POST /:id/copy` deep-clone cả row + BOM + routing |
| `product-groups` | master-data | |
| `boms` | boms | mount ở `/products/:productId/bom` |
| `routing` | routing | mount ở `/products/:productId/operations` **và** `.../bom/items/:itemId/operations` |
| `materials` | materials | |
| `material-groups` | master-data | duy nhất trong nhóm master-data yêu cầu quyền (`materials:read`) |
| `suppliers` | — | |
| `supplier-groups` | master-data | |
| `units` | — | |
| `departments` | master-data | |
| `positions` | master-data | |
| `countries` | master-data | chỉ đọc, không phân trang |
| `operations` | master-data | chỉ đọc từ 2026-07-28 (từng có CRUD) |
| `orders` | orders | **mọi** route cần bearer token, kể cả đọc |
| `inventory` | inventory | hai controller: `/inventory` và `/stock-receipts` |
| `production-orders` | production | 1 PO duyệt = 1 LSX |
| `production-jobs` | production | 1 sản phẩm FG = 1 Job trong một LSX |

## Domain docs

- `docs/architecture.md` — sơ đồ ER theo cụm + thứ tự ghi của các luồng bắc cầu nhiều module + bất
  biến xuyên module. Đọc trước khi sửa gì chạm ≥ 2 module.
- `docs/features/<x>.md` — business rules + API contract của từng module. Viết/cập nhật trước khi
  làm feature mới hoặc đổi business rule đáng kể của feature cũ — phạm vi và quy ước ở
  `.claude/rules/workflow.md`.

## Standing decisions

Chỉ giữ quyết định còn **cấm** hoặc **đảo ngược** điều gì đó, nên vẫn ảnh hưởng cách viết code hôm
nay — mỗi dòng có ngày. Toàn bộ lịch sử khác (đổi tên, redesign, rollback rồi lại rollback) nằm trong
`git log`, không lặp lại ở đây.

- **2026-07-28 — testing tạm dừng toàn repo.** Không tạo/sửa `*.spec.ts` mới, không chạy
  `pnpm test*` trừ khi được yêu cầu rõ. `.claude/rules/testing.md` chủ ý không import.
- **2026-07-29 — comment trong code viết tiếng Việt** (identifier + commit message vẫn tiếng Anh).
  Kiểu viết: `.claude/rules/code-docs.md`.
- **2026-07-24 — `product-revisions` đã xoá; versioning = clone cả product** (`POST /products/:id/copy`).
  Đừng tạo lại `product_revisions`/`currentRevisionId`.
- **2026-07-29 — `OrderStatus.DRAFT` đã quay lại** sau khi bị bỏ vài ngày trước đó. Đọc enum thật từ
  `src/database/schemas/orders.ts`, đừng nhớ hoặc chép từ doc cũ.
- **`uploads` đã bị `files` thay thế.** Đừng tạo lại.

## Gotchas

- `orders.staffId` là FK nghiệp vụ **duy nhất** trỏ `users.id` — mọi FK "ai đã làm việc này" khác
  (`createdBy`, `approvedBy`, `startedBy`, ...) trỏ `credentials.id`.
- `src/common/{offset,cursor}-pagination/`, `common/error.dto.ts`, `common/error-detail.dto.ts`,
  `common/base.res.dto.ts` là **code chết — 0 nơi import**. Bản đang dùng nằm ở `src/common/dto/`.
- `uploads/` phục vụ tĩnh ở `/uploads/` và bị git-ignore.
