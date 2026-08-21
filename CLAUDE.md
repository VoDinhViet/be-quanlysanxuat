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

| Rule               | Nạp khi             | Chứa                                            |
| ------------------ | ------------------- | ----------------------------------------------- |
| `general.md`       | luôn                | pnpm, thao tác nguy hiểm, ngôn ngữ, commit      |
| `documentation.md` | luôn                | tầng doc nào chứa gì + khuôn comment trong code |
| `api.md`           | luôn                | controller + DTO (biên HTTP)                    |
| `service.md`       | luôn                | business logic, query, ghi, lỗi, phân trang     |
| `database.md`      | luôn                | schema Drizzle, soft delete                     |
| `security.md`      | luôn                | route public, `@Permissions`, lộ dữ liệu        |
| `transactions.md`  | khi cần transaction | trỏ từ `service.md`, mục Writes                 |
| `seeds.md`         | khi viết seed       | trỏ từ `database.md`, mục Seeds                 |

Skill (quy trình rời rạc, tự chọn lúc dùng) sống ở `.claude/skills/`, chuẩn đặt ở `.claude/README.md`.

## Commands

```bash
pnpm start:dev                    # dev server watch, cổng lấy từ .env PORT (mặc định .env.example: 8003), api ở /api

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

36 module dưới `src/api/`. `users` là module tham chiếu cho code mới (controller/service, DTO, lỗi,
phân trang — chi tiết ở `.claude/rules/`). Đăng ký module mới trong `src/app.module.ts`. Cột `Domain`
là file dưới `docs/domains/`, `—` nghĩa là hạ tầng thuần, không thuộc domain nghiệp vụ nào.

| Module                 | Domain            | Ghi chú                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `auth`                 | identity-access   | login/refresh/logout; `guards/permissions.guard.ts` sống ở đây                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `users`                | identity-access   | module tham chiếu; `POST`/`PATCH` nhận `credential` lồng (tạo/sửa tài khoản ERP kèm hồ sơ)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `roles`                | identity-access   | chỉ đọc (`GET /roles`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `health`               | —                 | `GET /health`, ngoài prefix `api`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `files`                | —                 | registry file dùng chung — mọi đính kèm trỏ vào đây, không phải URL trần                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `clients`              | partners          | contact là xoá+chèn lại toàn bộ mỗi lần sửa — id contact không ổn định                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `client-groups`        | partners          |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `items`                | product-structure | gộp `products`+`materials` cũ (`type = FG\|WIP\|RM`, xem `docs/decisions/items-merge.md`); `POST /:id/copy` deep-clone row + BOM, chỉ FG/WIP                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `boms`                 | product-structure | mount ở `/items/:itemId/bom`; node BOM có thể là WIP (có con) hoặc RM (lá)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `bom-operations`       | product-structure | công đoạn as-used của một node BOM WIP, mount ở `.../bom/items/:bomItemId/operations`; import `BomsModule`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `routings`             | product-structure | công đoạn Cấp 0 của chính item gốc (FG/WIP), mount ở `/items/:itemId/operations`; ghi qua `routings`/`routing_operations`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `suppliers`            | partners          |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `supplier-groups`      | partners          |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `units`                | —                 | scope `PRODUCT`/`MATERIAL` quyết định dùng được ở đâu                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `departments`          | partners          |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `positions`            | partners          |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `countries`            | partners          | chỉ đọc, không phân trang                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `operations`           | partners          | chỉ đọc (từng có CRUD)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `orders`               | orders            | **mọi** route cần bearer token, kể cả đọc                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `warehouses`           | inventory         | danh mục kho — `code`/`name`/`type`/`status`, không soft delete                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `inventory`            | inventory         | chỉ đọc — `/inventory` + `/inventory/balances` mặc định lọc FG/RM (kho không quản tồn WIP, `docs/decisions/wip-not-stocked.md`, gửi tường minh `itemType=WIP` vẫn xem được), `/inventory/transactions` không đổi (mọi loại); sở hữu `InventoryPostingService`                                                                                                                                                                                                                                                                                                                                                                                    |
| `inventory-receipts`   | inventory         | phiếu nhập — vòng đời 5 trạng thái `DRAFT`/`PENDING_IQC`/`PENDING_RECEIPT`/`POSTED`/`CANCELLED` (`confirm` xen giữa lập phiếu và `post`, nhánh IQC tự sinh phiếu kiểm khi `requiresIqc=true`, xem `docs/workflows/receipt-confirmation.md`); `receiptType=PRODUCTION` bắt buộc `productionJobId`, `confirm` chặn nếu Job chưa qua hết OQC (`E196`) hoặc vượt SL kế hoạch (`E197`, `docs/workflows/final-qc.md`); import `InventoryModule`+`WarehousesModule`+`IqcModule`                                                                                                                                                                         |
| `inventory-issues`     | inventory         | phiếu xuất — cùng vòng đời, cùng khuôn `inventory-receipts`; `post` với `issueType=PRODUCTION` chặn (`E203`) nếu còn IQC chưa `COMPLETED` của cùng (item, kho) — `docs/decisions/qc-gates-on-stock-moves.md`                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `supplier-returns`     | inventory         | phiếu trả NCC — bảng phẳng (1 phiếu = 1 dòng vật tư); `GET` list/detail + `POST /:id/post` (trừ tồn nếu phiếu nhập gốc đã `POSTED`, hoàn tất luôn IQC liên kết); tự sinh (`DRAFT`) từ `iqc` khi disposition SORT/RETURN, chưa có route tạo tay/`cancel`                                                                                                                                                                                                                                                                                                                                                                                          |
| `outsourcing-orders`   | inventory         | Phiếu gửi gia công ngoài (OS-OUT) — header + nhiều dòng (`outsourcing_order_items`), **không có nháp** — `POST` tạo là `POSTED` ngay (`docs/decisions/outsourcing-no-draft.md`), **không đụng tồn kho** — mặt hàng luôn là WIP, kho không quản tồn WIP (`docs/decisions/wip-not-stocked.md`); mỗi dòng gắn `productionJobOperationId`, client gửi thẳng `itemId`/`operationCode`/`operationName`, server không resolve/validate lại; chỉ còn `cancel`, không có `PATCH`/`DELETE`/`post` riêng; `GET .../outsourceable-operations` popup chọn part                                                                                                |
| `outsourcing-receipts` | inventory         | Phiếu nhận gia công ngoài (OS-IN) — header + nhiều dòng (`outsourcing_receipt_items`), cũng không có nháp, cũng không đụng tồn kho — `POST` tạo là `POSTED` ngay, sinh N phiếu IQC nếu `requiresIqc`; mỗi dòng trỏ đúng 1 dòng OS-OUT, **1 phiếu OS-IN = 1 NCC** nhưng gộp được nhiều OS-OUT khác nhau cùng NCC; chỉ còn `cancel`, không có `PATCH`/`DELETE`/`post` riêng; `GET .../pending-order-items` popup chọn hàng cần nhận; import `IqcModule`                                                                                                                                                                                            |
| `outbound-orders`      | inventory         | Phiếu giao hàng (DO) — header + nhiều dòng (`outbound_order_items`); `POST` tạo nháp (luôn `DRAFT`) + `GET` list/detail + `GET .../items` + `POST :id/confirm` (`DRAFT → PENDING_DELIVERY`, chặn `E205` nếu còn Job nào chưa qua hết OQC — `getJobQcCoverage`), chưa có duyệt/`PATCH`/`DELETE`/xác nhận giao thật, chưa đụng tồn kho, chưa giữ chỗ (reserve); mỗi dòng trỏ 1 `order_item` (không unique — giao nhiều lần/1 PO), client gửi thẳng `itemId`/`productionJobId` (lấy từ popup), server không resolve/validate lại; `GET .../unfulfilled-order-items` popup chọn PO/Job, listing thuần theo trạng thái đơn (không tính tồn/giữ chỗ) |
| `iqc`                  | quality           | Kiểm tra chất lượng hàng nhập — bảng phẳng (1 phiếu = 1 lần kiểm 1 vật tư); `GET` list/`GET stats`/detail, `POST` tạo, `POST :id/confirm` (nút "Lưu" duy nhất, QC tự chọn `result`), `PATCH :id` (sửa ngữ cảnh sau confirm), `DELETE :id` (chỉ khi `NOT_INSPECTED`, `E206`) — đường gỡ đi kèm gate `inventory-issues` mới; `status` suy từ `result`/`disposition`                                                                                                                                                                                                                                                                                |
| `oqc`                  | quality           | Kiểm chất lượng công đoạn (OQC) trước nhập kho/giao hàng — bảng phẳng, tách biệt IQC, gắn theo `productionJobOperationId` (không còn theo cả Job, `docs/decisions/oqc-per-operation.md`); không còn `POST /oqc` tay lẫn popup `GET .../inspectable-operations` — tạo qua đúng 1 route `POST /production-jobs/:jobId/qc` (không nhận body, xem module `production-jobs`); `GET .../aql-plan` gợi ý cỡ mẫu; `status` 4 giá trị (`NOT_INSPECTED`/`PENDING`/`REWORK`/`COMPLETED`); `result` auto-suy từ Ac/Re (`resultAuto`), cho QC ghi đè có lý do; `disposition` FAIL riêng (`ACCEPT`/`REWORK`/`SCRAP`, khác IQC); `COMPLETED` khoá `confirm` cứng; `DELETE` chỉ khi `NOT_INSPECTED`; `inventory-receipts`/`outbound-orders` đọc `getJobQcCoverage` để gate               |
| `production-orders`    | production        | 1 PO duyệt = 1 LSX                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `production-jobs`      | production        | 1 item FG = 1 Job trong một LSX; `POST :jobId/qc` yêu cầu QC thành phẩm cho cả Job — 1 cú bấm, không body, chỉ chạy được khi mọi công đoạn đã xong (import `OqcModule`, gọi thẳng `OqcService.createOqcForJob`)                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `purchase-requests`    | purchase-requests | Đề xuất mua hàng — `POST` lập tay (luôn `DRAFT`, không gắn LSX/Job, dòng bắt buộc RM) **hoặc** tự sinh khi `production-jobs` start Job thiếu vật tư; `GET` list/detail + `PATCH`/`DELETE .../items/:purchaseRequestItemId` (sửa/xoá dòng, chỉ `DRAFT`/`REJECTED`) + `DELETE /:purchaseRequestId` (xoá cả phiếu, chỉ `DRAFT`/`REJECTED`) + `POST .../send`/`.../approve`/`.../reject` (gửi duyệt/duyệt/từ chối, `REJECTED` là điểm cuối trừ khi sửa/xoá dòng lại đưa về `DRAFT`); chưa sửa được header sau khi tạo, cũng chưa thêm được dòng mới vào phiếu đã tạo                                                                                 |
| `purchase-ledger`      | purchasing        | Sổ cái mua hàng — chỉ `GET /purchase-ledger`, 1 dòng/1 `purchase_request_items` của phiếu `APPROVED`, mọi số tính lúc đọc từ bốn bảng của `purchase-quotations`/`purchase-orders`                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `purchase-quotations`  | purchasing        | Báo giá (RFQ) — một vật tư có nhiều NCC chào giá, một dòng vật tư gộp được nhiều dòng ĐXMH cùng mã vật tư (bảng phân bổ `purchase_quotation_item_allocations` giữ SL từng dòng); `GET` list/detail + CRUD tay + `send`/`approve` (chọn NCC thắng thầu từng vật tư, tự sinh PO Draft)/`reject`/`request-changes`/`recall`                                                                                                                                                                                                                                                                                                                         |
| `purchase-orders`      | purchasing        | Đơn mua (PO) — `GET` list/detail; chưa có `POST` tay, PO hiện chỉ sinh tự động từ duyệt RFQ (`purchase-quotations`); `PATCH /:id` + `PATCH /:id/items/:itemId` sửa người phụ trách/điều khoản TT/kho nhập/ngày giao/SL/giá khi còn `DRAFT`; `POST /:id/confirm` xác nhận đặt hàng (`DRAFT → ORDERED`, cần `paymentTerm`); `POST /:id/cancel` huỷ (`DRAFT`/`ORDERED → CANCELLED`)                                                                                                                                                                                                                                                                 |
| `payment-requests`     | purchasing        | Yêu cầu thanh toán — `GET` list/detail; **không có `POST` tay**, tự sinh khi PO đạt `COMPLETED` (gọi từ `inventory-receipts` lúc `post`); `POST /:id/mark-paid`/`.../cancel` (`PENDING → PAID`/`CANCELLED`, cuối, không rollback)                                                                                                                                                                                                                                                                                                                                                                                                                |

## Domain docs

Bốn tầng, đọc từ trên xuống khi cần hiểu một vùng nghiệp vụ:

- `docs/architecture.md` — sơ đồ ER theo cụm + thứ tự ghi qua nhiều module. Đọc trước khi sửa gì
  chạm ≥ 2 module.
- `docs/domains/<domain>.md` — **"tại sao"**: khái niệm, vòng đời, business rule, bất biến, phụ
  thuộc chéo domain, và lỗi hay mắc. Chín domain: `orders`, `production`, `inventory`,
  `product-structure`, `identity-access`, `partners`, `purchase-requests`, `purchasing`, `quality`.
  Đọc trước khi làm feature trong vùng đó.
- `docs/workflows/<flow>.md` — **"chạy theo trình tự nào"**: trigger, actor, precondition, các bước,
  đổi trạng thái gì, ranh giới transaction, nhánh lỗi. Đọc trước khi sửa một luồng nghiệp vụ đầu-cuối.
  Mười luồng: `order-approval`, `production-order-approval`, `production-job-execution`,
  `stock-movement`, `receipt-confirmation`, `product-setup`, `rfq-approval`, `supplier-return`,
  `outsourcing-round-trip`, `final-qc`.
- `docs/decisions/<slug>.md` — **quyết định đảo chiều hoặc ranh giới phạm vi** không domain nào sở
  hữu. Đọc khi định làm ngược lại một thứ đang có, hoặc khi ngạc nhiên vì một tính năng "lẽ ra phải
  có" lại không có: `files-registry`, `testing-paused`, `swagger-owns-api-reference`,
  `no-procurement`, `orders-no-delete`, `items-merge`, `stored-inventory-balances`,
  `outsourcing-no-draft`, `wip-not-stocked`, `oqc-per-operation`, `qc-gates-on-stock-moves`.

**Không có tầng doc theo module** — `docs/features/` đã xoá. Reference mức route/DTO
đọc ở Swagger `/api-docs`; `ErrorCode` đọc ở `src/constants/error-code.constant.ts` + service ném nó.

Chuỗi chính của hệ thống: duyệt đơn → duyệt LSX → chạy Job, rồi kho là một luồng **tách rời** chạy
tay. Đề xuất mua hàng đã duyệt (`purchase-requests`) tiếp tục sang báo giá/đơn mua
(`docs/domains/purchasing.md`) — nhập vật tư vẫn là phiếu kho lập tay, nay có thể trace về đơn mua.

Viết/cập nhật doc trước khi làm feature mới hoặc đổi business rule — quy ước ở
`.claude/rules/documentation.md`.

## Standing decisions

Quyết định đảo chiều nằm ở `docs/decisions/` — testing tạm dừng, `files` thay `uploads`, Swagger là
reference API, `products`+`materials` gộp thành `items`. `no-procurement.md` từng chặn mua hàng,
nay đã đảo ngược một phần (`docs/domains/purchasing.md`) — đọc kỹ phần "vẫn không làm" trong đó
trước khi định mở rộng thêm (công nợ, thanh toán, bảng giá theo thời gian).

Một cảnh báo không thuộc file nào khác: **enum trạng thái (`OrderStatus`, `ProductionOrderStatus`,
`ProductionJobStatus`, ...) đổi khá thường xuyên** — luôn đọc giá trị thật từ
`src/database/schemas/*.ts` trước khi viết code hay trả lời, đừng tin mô tả bằng lời ở bất kỳ đâu,
kể cả file này.

<!-- gitnexus:start -->

# GitNexus — Code Intelligence

This project is indexed by GitNexus as **be-quanlysanxuat** (4213 symbols, 11249 relationships, 177 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "main"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({search_query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource                                          | Use for                                  |
| ------------------------------------------------- | ---------------------------------------- |
| `gitnexus://repo/be-quanlysanxuat/context`        | Codebase overview, check index freshness |
| `gitnexus://repo/be-quanlysanxuat/clusters`       | All functional areas                     |
| `gitnexus://repo/be-quanlysanxuat/processes`      | All execution flows                      |
| `gitnexus://repo/be-quanlysanxuat/process/{name}` | Step-by-step execution trace             |

## CLI

| Task                                         | Read this skill file                                        |
| -------------------------------------------- | ----------------------------------------------------------- |
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md`       |
| Blast radius / "What breaks if I change X?"  | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?"             | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md`       |
| Rename / extract / split / refactor          | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md`     |
| Tools, resources, schema reference           | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md`           |
| Index, status, clean, wiki CLI commands      | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md`             |

<!-- gitnexus:end -->
