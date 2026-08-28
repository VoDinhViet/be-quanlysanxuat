# CLAUDE.md

Hướng dẫn cho Claude Code khi làm việc trong repo này.

## Stack

NestJS 11 modular monolith cho hệ thống quản lý sản xuất. PostgreSQL + Drizzle ORM, Redis, Swagger
UI ở `/api-docs` (ngoài production). Package manager là **pnpm**. Env nạp từ `.env.${NODE_ENV}`
trước, `.env` sau. Cần Postgres + Redis đang chạy. `package.json` vẫn tên `be-giasu-ai`.

## Rules

Đặt tên theo **thứ đang sửa**. Sáu rule luôn nạp qua `@import`:

@.claude/rules/general.md
@.claude/rules/documentation.md
@.claude/rules/api.md
@.claude/rules/service.md
@.claude/rules/database.md
@.claude/rules/security.md

| Rule               | Nạp khi             | Chứa                                            |
| ------------------ | ------------------- | ------------------------------------------------ |
| `general.md`       | luôn                | pnpm, thao tác nguy hiểm, ngôn ngữ, commit       |
| `documentation.md` | luôn                | tầng doc nào chứa gì + khuôn comment trong code  |
| `api.md`           | luôn                | controller + DTO (biên HTTP)                     |
| `service.md`       | luôn                | business logic, query, ghi, lỗi, phân trang      |
| `database.md`      | luôn                | schema Drizzle, soft delete                      |
| `security.md`      | luôn                | route public, `@Permissions`, lộ dữ liệu         |
| `transactions.md`  | khi cần transaction | trỏ từ `service.md`, mục Writes                  |
| `seeds.md`         | khi viết seed       | trỏ từ `database.md`, mục Seeds                  |

Skill (quy trình rời rạc, tự chọn lúc dùng) sống ở `.claude/skills/`, chuẩn đặt ở `.claude/README.md`.

## Commands

```bash
pnpm start:dev                    # dev server watch, cổng lấy từ .env PORT (mặc định .env.example: 8003), api ở /api

pnpm db:generate                  # sinh migration từ thay đổi schema
pnpm db:migrate                   # áp migration — không chạy vào DB dùng chung/prod khi chưa được duyệt
pnpm db:studio
pnpm db:reset                     # dry-run mặc định (in sẽ xoá gì); thêm --yes để xoá thật, chỉ giữ 1 admin + countries, chặn cứng khi NODE_ENV=production

pnpm db:seed:<name>                # xem package.json cho danh sách đầy đủ
```

## Request pipeline

`src/app.module.ts` đăng ký `JwtAuthGuard` rồi `PermissionsGuard` làm `APP_GUARD`, đúng thứ tự đó —
**mọi route mặc định cần bearer token hợp lệ**. Đánh dấu `@Public()`/`@ApiPublic()` để bỏ qua cả
hai; khai quyền bằng `@Permissions('resource:action')` (role có `system:manage` qua mọi kiểm tra);
`@CurrentUser()` trả `undefined` trên route public.

`ValidationPipe` toàn cục: `whitelist: true` (field lạ bị âm thầm loại bỏ, không lỗi), `transform: true`,
lỗi validate trả 422. Prefix toàn cục `api`, trừ `GET /`/`GET /health`.

## Modules

42 module dưới `src/api/`. `users` là module tham chiếu cho code mới. Đăng ký module mới trong
`src/app.module.ts`. Cột `Domain` là file dưới `docs/domains/`, `—` là hạ tầng thuần.

| Module                   | Domain             | Ghi chú                                                                                                                                                                       |
| ------------------------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `auth`                   | identity-access    | login/refresh/logout; `guards/permissions.guard.ts` sống ở đây                                                                                                               |
| `users`                  | identity-access    | module tham chiếu; `POST`/`PATCH` nhận `credential` lồng                                                                                                                     |
| `roles`                  | identity-access    | full CRUD                                                                                                                                                                     |
| `health`                 | —                  | `GET /health`, ngoài prefix `api`                                                                                                                                             |
| `files`                  | —                  | registry file dùng chung — mọi đính kèm trỏ vào đây, không phải URL trần                                                                                                     |
| `clients`                | partners           | contact là xoá+chèn lại toàn bộ mỗi lần sửa                                                                                                                                  |
| `client-groups`          | partners           |                                                                                                                                                                                |
| `items`                  | product-structure  | gộp `products`+`materials` cũ (`type = FG\|WIP\|RM`); full CRUD kể cả `DELETE`; `POST /:id/copy` deep-clone, chỉ FG/WIP                                                      |
| `boms`                   | product-structure  | mount ở `/items/:itemId/bom`; node BOM là WIP (có con) hoặc RM (lá)                                                                                                          |
| `bom-operations`         | product-structure  | công đoạn as-used của một node BOM WIP, mount ở `.../bom/items/:bomItemId/operations`                                                                                        |
| `routings`               | product-structure  | công đoạn Cấp 0 của item gốc (FG/WIP), mount ở `/items/:itemId/operations`                                                                                                   |
| `suppliers`              | partners           |                                                                                                                                                                                |
| `supplier-groups`        | partners           |                                                                                                                                                                                |
| `units`                  | product-structure  | `scope` (`PRODUCT`/`MATERIAL`/`SEMI_FINISHED`); `PATCH` gửi `scopes` thì xoá + chèn lại toàn bộ                                                                              |
| `departments`            | partners           |                                                                                                                                                                                |
| `positions`              | partners           |                                                                                                                                                                                |
| `countries`              | partners           | chỉ đọc, không phân trang                                                                                                                                                     |
| `operations`             | partners           | full CRUD; `delete`/`update` chặn `E248` nếu đang được routing/BOM dùng                                                                                                      |
| `orders`                 | orders             | **mọi** route cần bearer token, kể cả đọc                                                                                                                                    |
| `warehouses`             | inventory          | danh mục kho — `code`/`name`/`type`, không soft delete                                                                                                                       |
| `inventory`              | inventory          | chỉ `GET /balances` + `GET /transactions`, không còn route list                                                                                                              |
| `inventory-products`     | inventory          | Tồn kho thành phẩm — `GET /inventory-products` (FG) + `.../ledger` (thẻ kho)                                                                                                 |
| `inventory-materials`    | inventory          | Tồn kho vật tư — `GET /inventory-materials` (RM); chưa có thẻ kho riêng                                                                                                      |
| `inventory-receipts`     | inventory          | phiếu nhập — 5 trạng thái, nhánh IQC tự sinh khi `requiresIqc`; `receiptType=PRODUCTION` gate OQC                                                                            |
| `inventory-issues`       | inventory          | phiếu xuất — cùng khuôn `inventory-receipts`; `issueType=PRODUCTION` bị chặn tạo tay (`E234`)                                                                                |
| `inventory-requisitions` | inventory          | Phiếu lãnh vật tư — đường **duy nhất** đưa RM ra khỏi kho cho SX; 6 trạng thái riêng; `issue` tự sinh 1 `inventory_issues POSTED`                                            |
| `supplier-returns`       | inventory          | phiếu trả NCC — bảng phẳng; tự sinh (`DRAFT`) từ `iqc`; chỉ có `GET` + `POST /:id/post`, chưa có tạo tay/`cancel`                                                            |
| `outsourcing-orders`     | inventory          | OS-OUT — không có nháp, `POST` là `POSTED` ngay; không đụng tồn kho (mặt hàng luôn WIP)                                                                                      |
| `outsourcing-receipts`   | inventory          | OS-IN — cùng khuôn OS-OUT; sinh N phiếu IQC nếu `requiresIqc`; 1 phiếu = 1 NCC, gộp nhiều OS-OUT                                                                             |
| `outbound-orders`        | inventory          | DO — 6 trạng thái (`DRAFT`/`PENDING_APPROVAL`/`PENDING_DELIVERY`/`DELIVERED`/`CANCELLED`/`REJECTED`); `send`/`approve`/`reject`/`deliver`/`cancel` + `PATCH`/`DELETE`; `deliver` tự sinh `inventory_issues POSTED` + trừ tồn thật |
| `qc-aql`                 | quality-iqc        | Master data phương án lấy mẫu AQL; `iqc`/`oqc` đọc qua `resolveAqlPlan()`                                                                                                     |
| `iqc`                    | quality-iqc        | QC hàng nhập — `qc_requests`+`qc_inspections` (`kind=INCOMING`), attempt append-only                                                                                          |
| `oqc`                    | quality-oqc        | QC công đoạn trước nhập kho/giao hàng — cùng bảng với IQC (`kind=OUTGOING`); tạo duy nhất qua `POST /production-jobs/:jobId/qc`                                              |
| `production-orders`      | production         | 1 PO duyệt = 1 LSX                                                                                                                                                            |
| `production-jobs`        | production         | 1 item FG = 1 Job/LSX; `POST :jobId/qc` gọi `OqcService.createOqcForJob`                                                                                                     |
| `production-execution`   | production         | Màn "Thực hiện sản xuất" — `GET operations`→`GET jobs`→`POST .../reports` (cộng dồn); khác `PATCH .../operations/:id` (điều chỉnh ghi đè của quản lý)                        |
| `purchase-requests`      | purchase-requests  | Đề xuất mua — lập tay hoặc tự sinh khi Job thiếu vật tư; `send`/`approve`/`reject`; chưa sửa được header                                                                     |
| `purchase-ledger`        | purchasing         | Sổ cái mua hàng — chỉ `GET /purchase-ledger`                                                                                                                                  |
| `purchase-quotations`    | purchasing         | RFQ — `GET`/CRUD tay + `send`/`approve` (tự sinh PO Draft)/`reject`/`recall`                                                                                                 |
| `purchase-orders`        | purchasing         | PO — `GET`/`POST` tay/`PATCH`/`POST :id/confirm` (`DRAFT→ORDERED`)/`POST :id/cancel`; PO cũng sinh tự động từ duyệt RFQ                                                      |
| `payment-requests`       | purchasing         | **không có `POST` tay** — tự sinh khi PO `COMPLETED` (từ `inventory-receipts` lúc `post`); `mark-paid`/`cancel`                                                              |
| `reports`                | —                  | Chỉ `GET /reports/stats`                                                                                                                                                      |

## Domain docs

Bốn tầng, đọc từ trên xuống khi cần hiểu một vùng nghiệp vụ:

- `docs/architecture.md` — sơ đồ ER theo cụm + thứ tự ghi qua nhiều module. Đọc trước khi sửa gì
  chạm ≥ 2 module.
- `docs/domains/<domain>.md` — **"tại sao"**: khái niệm, vòng đời, business rule, bất biến, phụ
  thuộc chéo domain, lỗi hay mắc. Chín domain, mười file (`quality` tách `quality-iqc`/`quality-oqc`):
  `orders`, `production`, `inventory`, `product-structure`, `identity-access`, `partners`,
  `purchase-requests`, `purchasing`, `quality-iqc`, `quality-oqc`. Đọc trước khi làm feature trong
  vùng đó.
- `docs/workflows/<flow>.md` — **"chạy theo trình tự nào"**: trigger, actor, precondition, các bước,
  đổi trạng thái gì, ranh giới transaction, nhánh lỗi. Mười ba luồng: `order-approval`,
  `production-order-approval`, `production-job-execution`, `stock-movement`, `receipt-confirmation`,
  `product-setup`, `rfq-approval`, `supplier-return`, `outsourcing-round-trip`, `outgoing-qc`,
  `inventory-requisition`, `outbound-delivery`, `purchase-to-payment`.
- `docs/decisions/<slug>.md` — **quyết định đảo chiều hoặc ranh giới phạm vi** không domain nào sở
  hữu: `files-registry`, `testing-paused`, `swagger-owns-api-reference`, `purchasing-scope-limits`,
  `orders-no-delete`, `items-merge`, `stored-inventory-balances`, `outsourcing-no-draft`,
  `wip-not-stocked`, `oqc-per-operation`, `qc-gates-on-stock-moves`, `qc-data-model`,
  `qc-aql-master-data`, `bom-explosion-in-job-demand`, `production-lifecycle-closing`,
  `report-trends-derived`.

**Không có tầng doc theo module** — Swagger `/api-docs` sở hữu route/DTO; `ErrorCode` đọc ở
`src/constants/error-code.constant.ts` + service ném nó.

Chuỗi chính: duyệt đơn → duyệt LSX → chạy Job, rồi kho là luồng **tách rời** chạy tay. Đề xuất mua
đã duyệt tiếp tục sang báo giá/đơn mua/nhập kho/thanh toán (`docs/workflows/purchase-to-payment.md`).

Viết/cập nhật doc trước khi làm feature mới hoặc đổi business rule — quy ước ở
`.claude/rules/documentation.md`.

## Standing decisions

Quyết định đảo chiều nằm ở `docs/decisions/`. `purchasing-scope-limits.md` giới hạn còn lại của mua
hàng — đọc trước khi định mở rộng (công nợ, thanh toán, bảng giá theo thời gian).

Một cảnh báo không thuộc file nào khác: **enum trạng thái đổi khá thường xuyên** — luôn đọc giá trị
thật từ `src/database/schemas/*.ts` trước khi viết code hay trả lời, đừng tin mô tả bằng lời ở bất
kỳ đâu, kể cả file này.

GitNexus sinh tự động khối hướng dẫn của nó ở `AGENTS.md` (không lặp lại ở đây — tránh nạp trùng).
