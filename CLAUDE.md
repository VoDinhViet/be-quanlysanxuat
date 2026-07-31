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

pnpm db:seed:<name>                # xem package.json cho danh sách đầy đủ
```

## Request pipeline

`src/app.module.ts` đăng ký `JwtAuthGuard` rồi `PermissionsGuard` làm `APP_GUARD`, đúng thứ tự đó —
**mọi route mặc định cần bearer token hợp lệ**. Đánh dấu `@Public()`/`@ApiPublic()` để bỏ qua cả
hai; khai quyền bằng `@Permissions('resource:action')` (role có `system:manage` qua mọi kiểm tra);
`@CurrentUser()` trả `undefined` trên route public.

`ValidationPipe` toàn cục: `whitelist: true` (field lạ bị âm thầm loại bỏ, không lỗi), `transform: true`,
lỗi validate trả 422. Prefix toàn cục `api`, trừ `GET /`/`GET /health` — health check ở `/health`,
không phải `/api/health`.

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
| `product-groups` | — | |
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

Chỉ giữ ràng buộc còn **cấm** hoặc **bắt buộc** hôm nay — không phải nhật ký thay đổi. Lịch sử đầy
đủ (đổi tên, redesign, rollback) nằm trong `git log` và trong từng `docs/features/<x>.md`.

- **Testing tạm dừng repo-wide (2026-07-28).** Không tạo/sửa `*.spec.ts`, không chạy `pnpm test*`
  trừ khi được yêu cầu rõ. `.claude/rules/testing.md` chủ ý không import — đọc file đó để biết cách
  bật lại.
- **Enum trạng thái (`OrderStatus`, `ProductionOrderStatus`, `ProductionJobStatus`, ...) đổi khá
  thường xuyên** — luôn đọc giá trị thật từ `src/database/schemas/*.ts` trước khi viết code hay trả
  lời, đừng tin mô tả bằng lời ở bất kỳ đâu, kể cả doc này.
- **`uploads` đã bị `files` thay thế** — đừng tạo lại module đó.
