# CLAUDE.md

Hướng dẫn cho Claude Code khi làm việc trong repo này.

## Stack

NestJS 11 modular monolith cho hệ thống quản lý sản xuất ("quản lý sản xuất"). PostgreSQL + Drizzle
ORM, Redis, Swagger UI ở `/api-docs` (ngoài production). Package manager là **pnpm**. Env nạp từ
`.env.${NODE_ENV}` trước, `.env` sau (`src/main.ts` + các seed script). Cần Postgres + Redis đang
chạy. `package.json` vẫn tên `be-giasu-ai` — chưa đổi tên cho dự án này.

## Rules

Đặt tên theo **thứ đang sửa**. Sáu rule luôn nạp qua `@import`:

@.claude/rules/general.md
@.claude/rules/documentation.md
@.claude/rules/api.md
@.claude/rules/service.md
@.claude/rules/database.md
@.claude/rules/security.md

| Rule | Nạp khi | Chứa |
| --- | --- | --- |
| `general.md` | luôn | pnpm, thao tác nguy hiểm, ngôn ngữ, commit |
| `documentation.md` | luôn | tầng doc nào chứa gì + khuôn comment trong code |
| `api.md` | luôn | controller + DTO (biên HTTP) |
| `service.md` | luôn | business logic, query, ghi, lỗi, phân trang |
| `database.md` | luôn | schema Drizzle, soft delete |
| `security.md` | luôn | route public, `@Permissions`, lộ dữ liệu |
| `transactions.md` | khi cần transaction | trỏ từ `service.md`, mục Writes |
| `seeds.md` | khi viết seed | trỏ từ `database.md`, mục Seeds |

Skill (quy trình rời rạc, tự chọn lúc dùng) sống ở `.claude/skills/`, chuẩn đặt ở `.claude/README.md`.

## Commands

```bash
pnpm start:dev                    # dev server watch, cổng lấy từ .env PORT (mặc định .env.example: 8003), api ở /api
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

28 module dưới `src/api/`. `users` là module tham chiếu cho code mới (controller/service, DTO, lỗi,
phân trang — chi tiết ở `.claude/rules/`). Đăng ký module mới trong `src/app.module.ts`. Cột `Domain`
là file dưới `docs/domains/`, `—` nghĩa là hạ tầng thuần, không thuộc domain nghiệp vụ nào.

| Module | Domain | Ghi chú |
| --- | --- | --- |
| `auth` | identity-access | login/refresh/logout; `guards/permissions.guard.ts` sống ở đây |
| `users` | identity-access | module tham chiếu |
| `roles` | identity-access | chỉ đọc (`GET /roles`) |
| `health` | — | `GET /health`, ngoài prefix `api` |
| `files` | — | registry file dùng chung — mọi đính kèm trỏ vào đây, không phải URL trần |
| `clients` | partners | contact là xoá+chèn lại toàn bộ mỗi lần sửa — id contact không ổn định |
| `client-groups` | partners | |
| `products` | product-structure | `POST /:id/copy` deep-clone cả row + BOM + routing |
| `product-groups` | product-structure | |
| `boms` | product-structure | mount ở `/products/:productId/bom` |
| `routing` | product-structure | mount ở `/products/:productId/operations` **và** `.../bom/items/:itemId/operations` |
| `materials` | partners | |
| `material-groups` | partners | danh mục duy nhất yêu cầu quyền (`materials:read`) |
| `suppliers` | partners | |
| `supplier-groups` | partners | |
| `units` | — | scope `PRODUCT`/`MATERIAL` quyết định dùng được ở đâu |
| `departments` | partners | |
| `positions` | partners | |
| `countries` | partners | chỉ đọc, không phân trang |
| `operations` | partners | chỉ đọc (từng có CRUD) |
| `orders` | orders | **mọi** route cần bearer token, kể cả đọc |
| `warehouses` | inventory | danh mục kho — `code`/`name`/`type`/`status`, không soft delete |
| `inventory` | inventory | chỉ đọc — `/inventory` (onHand/reserved), `/inventory/balances`, `/inventory/transactions`; sở hữu `InventoryPostingService` |
| `inventory-receipts` | inventory | phiếu nhập — vòng đời `DRAFT`/`POSTED`/`CANCELLED`, import `InventoryModule`+`WarehousesModule` |
| `inventory-issues` | inventory | phiếu xuất — cùng vòng đời, cùng khuôn `inventory-receipts` |
| `production-orders` | production | 1 PO duyệt = 1 LSX |
| `production-jobs` | production | 1 sản phẩm FG = 1 Job trong một LSX |
| `purchase-requests` | purchase-requests | Danh sách đề xuất mua hàng, chỉ `GET /purchase-requests`; chưa có route tạo/duyệt/từ chối — phiếu tự sinh khi `production-jobs` start Job thiếu vật tư |

## Domain docs

Bốn tầng, đọc từ trên xuống khi cần hiểu một vùng nghiệp vụ:

- `docs/architecture.md` — sơ đồ ER theo cụm + thứ tự ghi qua nhiều module. Đọc trước khi sửa gì
  chạm ≥ 2 module.
- `docs/domains/<domain>.md` — **"tại sao"**: khái niệm, vòng đời, business rule, bất biến, phụ
  thuộc chéo domain, và lỗi hay mắc. Bảy domain: `orders`, `production`, `inventory`,
  `product-structure`, `identity-access`, `partners`, `purchase-requests`. Đọc trước khi làm feature trong vùng đó.
- `docs/workflows/<flow>.md` — **"chạy theo trình tự nào"**: trigger, actor, precondition, các bước,
  đổi trạng thái gì, ranh giới transaction, nhánh lỗi. Đọc trước khi sửa một luồng nghiệp vụ đầu-cuối.
  Năm luồng: `order-approval`, `production-order-approval`, `production-job-execution`,
  `stock-movement`, `product-setup`.
- `docs/decisions/<slug>.md` — **quyết định đảo chiều hoặc ranh giới phạm vi** không domain nào sở
  hữu. Đọc khi định làm ngược lại một thứ đang có, hoặc khi ngạc nhiên vì một tính năng "lẽ ra phải
  có" lại không có: `files-registry`, `testing-paused`, `swagger-owns-api-reference`,
  `no-procurement`, `orders-no-delete`.

**Không có tầng doc theo module** — `docs/features/` đã xoá. Reference mức route/DTO
đọc ở Swagger `/api-docs`; `ErrorCode` đọc ở `src/constants/error-code.constant.ts` + service ném nó.

Chuỗi chính của hệ thống: duyệt đơn → duyệt LSX → chạy Job, rồi kho là một luồng **tách rời** chạy
tay. Không có mua hàng/đơn mua — nhập vật tư là phiếu kho lập tay (`docs/domains/partners.md`).

Viết/cập nhật doc trước khi làm feature mới hoặc đổi business rule — quy ước ở
`.claude/rules/documentation.md`.

## Standing decisions

Quyết định đảo chiều nằm ở `docs/decisions/` — testing tạm dừng, `files` thay `uploads`, Swagger là
reference API, không có mua hàng. Đọc trước khi định làm ngược lại thứ gì đang có.

Một cảnh báo không thuộc file nào khác: **enum trạng thái (`OrderStatus`, `ProductionOrderStatus`,
`ProductionJobStatus`, ...) đổi khá thường xuyên** — luôn đọc giá trị thật từ
`src/database/schemas/*.ts` trước khi viết code hay trả lời, đừng tin mô tả bằng lời ở bất kỳ đâu,
kể cả file này.
