<!-- Generated: 2026-11-05 | Files scanned: 24 | Token estimate: ~2100 -->
# MCP server codemap

Read-only Model Context Protocol endpoint for the company's internal chat agent. Paths: `M`=`src/api/mcp`. Citations are file paths.

## 1. What it is
- One endpoint, `POST /api/mcp` (Streamable HTTP, stateless, JSON responses instead of SSE). `GET` and `DELETE` return 405. Swagger hides it (`@ApiExcludeController`).
- 137 tools. Every tool is an existing `GET` controller method; nothing is re-implemented. Description and input schema are read from that route's metadata, so REST and MCP cannot drift.
- Authorization is only the API key: a valid key reads every tool, whatever the `@Permissions` on the route. Per-user permissions are deliberately not implemented yet (see section 2).
- Disabled unless `MCP_API_KEY` is set (>= 32 chars, `src/config/mcp.config.ts`). Unset key = every request 401 and no tool is registered (`McpToolsRegistry.onApplicationBootstrap`).
- Known external breakage: `../ai-platform` (separate repo) still calls the removed `/api/v1/integration/*` routes and `whoami`. It must move to `POST /api/mcp` and send only the `Api-Key` header.

## 2. Request flow
  `@Public()` (skips global JwtAuthGuard and PermissionsGuard) -> `McpApiKeyGuard` -> `ThrottlerGuard` -> `McpController.handleRequest` -> `McpServerFactory.create` -> SDK `McpServer` + `StreamableHTTPServerTransport` -> `McpToolInvoker.invoke` -> controller method (via `ModuleRef`).

- `McpApiKeyGuard` (`M/guards/mcp-api-key.guard.ts`): header `Api-Key` vs `MCP_API_KEY` through `secureCompare` (sha256 + `timingSafeEqual`, `src/common/utils/secure-compare.ts`). Missing or wrong = 401.
- `ThrottlerGuard` (nest throttler): the limit comes from `McpModule`'s own `ThrottlerModule.forRootAsync` (`mcp.rateLimitPerMinute`, `MCP_RATE_LIMIT_PER_MINUTE`, default 120 per minute), counted per client IP. The agent platform calls from one server, so all its users share that budget.
- `McpController.handleRequest` (`M/mcp.controller.ts`): builds a fresh server and transport per request, passes `request.body` because the 1 MB body parser already consumed the stream, closes both on response close. Optional `?domains=sales,inventory` limits `tools/list` (422 `V000` for an unknown domain).
- The key is the whole trust boundary: whoever holds it reads all 137 tools (employees, roles, payments, suppliers included). Keep it only in the agent platform's secret store and rotate by changing `MCP_API_KEY`. No identity is attached to a call, so the log line `mcp_tool_call tool=... ok=... ms=...` carries no user.
- Adding permissions later means: attach an identity to the call (a credential or a key-bound role), filter `McpToolsRegistry.listTools`, and give the `@CurrentUser()` routes in `excluded-routes.ts` (`/users/me`, `/reports/pending-approvals`, `ProductionExecutionController`) a real user again.

## 3. How a tool is built
- `MCP_CATALOG` (`M/catalog/index.ts`) lists entries made by `defineMcpTool` (`M/catalog/define-mcp-tool.ts`): `name`, Vietnamese `title`, English `hint`, `controller`, `method`. `method` is typed `keyof` the controller, so a wrong name fails `tsc`.
- `McpToolsRegistry.buildTool` (`M/registry/mcp-tools.registry.ts`) derives the rest:
  | Tool property | Source |
  |---|---|
  | description | swagger `apiOperation.summary` + catalog `hint` (+ paging note when `page` and `limit` exist) |
  | input schema | zod object built by `readToolInput` from `readHandlerArgs` (`M/registry/handler-args.ts`): `@Query() Dto` -> `buildDtoShape` (`M/registry/dto-zod-schema.ts`, reads the swagger metadata written by `src/decorators/field.decorators.ts`); `@UUIDParam('x')` -> required `x` (`z.string().uuid()`); `@CurrentUser()` -> no input. The object is `.strict()` (unknown argument = error) and the SDK converts it to JSON Schema for `tools/list` |
- Only `@Query() Dto`, `@Param('x')` and custom param decorators are supported. Any other parameter kind (body, request, response) throws at boot (`mcp_unsupported_handler_arg`), as do a catalog entry that is not a `GET`, a bad name, a duplicate name, a duplicated parameter, a path param without `ParseUUIDPipe`, or a route whose swagger `summary` is missing (canary for a renamed swagger metadata key).
- Startup log `mcp_tools_registered count=137 excluded=38 uncovered=0` (`reportRouteCoverage`). Every `GET` route is either in the catalog or matched by `MCP_EXCLUDED_ROUTES` (`M/catalog/excluded-routes.ts`: file downloads and import templates, UI dropdown routes, routes tied to the signed-in user (`SIGNED_IN_USER_PATHS`: `/users/me`, `/users/me/permissions`, `/reports/pending-approvals`; `SIGNED_IN_USER_CONTROLLERS`: `ProductionExecutionController`), and the infrastructure controllers `AppController`, `AuthController`, `FilesController`, `HealthController`, `McpController`); anything else logs `mcp_route_not_covered`.

## 4. Naming
`[<domain>_]<entity>_<action>`, lowercase snake_case, <= 64 chars. The `sales` domain (clients, SO, DO) has no prefix because the old modules were never called that: its tools are named after the module (`client_list`, `order_list`, `outbound_order_list`, `order_trace_get`) and the catalog entries declare `domain: 'sales'`; every other tool starts with its domain. A name that does not start with a domain must declare one or the registry stops the app. Domains (the `?domains=` values): `sales`, `purchasing`, `inventory`, `product`, `production`, `quality`, `report`, `org`. Actions: `list` (filter and paginate), `get` (one document by uuid), `stats`, `summary`. Trace tools end in `_trace_get`. Detail lines are `line`, chain notes `note`, history `log`. The registry rejects a name outside this pattern.

| Domain | Tools | Catalog file |
|---|---|---|
| sales | 19 | `catalog/sales.catalog.ts` (clients, SO, DO) |
| purchasing | 25 | `purchasing.catalog.ts` (suppliers, requests, RFQ, DMH, payment requests, ledger) |
| inventory | 21 | `inventory.catalog.ts` (balances, ledger, receipts, issues, requisitions, adjustments, supplier returns) |
| product | 15 | `product.catalog.ts` (items, BOM, routing, operations, categories, units) |
| production | 26 | `production.catalog.ts` (LSX, JOB, OS-OUT, OS-IN; the shop-floor `ProductionExecutionController` is excluded) |
| quality | 11 | `quality.catalog.ts` (IQC, OQC, NCR) |
| report | 6 | `report.catalog.ts` (reports controller) |
| org | 9 | `org.catalog.ts` (users, departments, positions, countries, roles) |
| (trace) | 5 | `trace.catalog.ts` (`TracesController`; names are `order_trace_get`, `purchasing_document_trace_get`, `purchasing_supplier_trace_get`, `product_item_supply_trace_get`, `product_item_structure_trace_get`) |

Counts are `defineMcpTool` entries per file (total 137). A tool's domain is its name prefix (or the declared `domain` for `sales`), not its file: `inventory_supplier_return_summary` is named for the inventory domain and sits in `inventory.catalog.ts`. 30 of the 137 tools are the former integration queries: 25 ordinary `GET` summary routes of the owning modules (`sales.md`, `purchasing.md`, `inventory.md`, `production.md`, `quality.md`; JWT + `@Permissions` like any route) and the 5 traces (`integration.md`).

### Field and metric vocabulary
One vocabulary for every DTO behind a tool (also in `MCP_SERVER_INSTRUCTIONS`, `M/mcp-server.factory.ts`). New response DTOs follow it; routes that predate it keep their keys.

| Meaning | Key | Rule |
|---|---|---|
| The row itself | `id`, `code`, `name` | `code` is the document code (SO0010, DMH-00006) |
| Another document the row points to | `<entity>Id`, `<entity>Code`, `<entity>Name` | `supplierId`, `orderCode`, `itemCode`, `clientName` |
| Number of rows | `<entity>Count` | `orderCount`, `jobCount`, `returnCount` |
| Money | `totalValue` | VND, foreign-currency orders converted by `exchangeRate` |
| Days past a due date | `daysOverdue` | >= 0, counted to "today" in Asia/Ho_Chi_Minh |
| Days until a date | `daysRemaining` | |
| Rate | `*Rate` | percentage 0-100 (`failRate`) |
| Dates | `YYYY-MM-DD` | `date` columns as text, never a `Date` |

"Overdue" is not one metric; compare figures only inside one tool:
- SO (`order_overdue_list`): `dueDate` before today and status `AWAITING_PRODUCTION` or `IN_PROGRESS`.
- DMH (`purchasing_order_overdue_list`): status `ORDERED`, `expectedDate` before today, not fully received.
- PR (`purchasing_request_stuck_list`): approved, lines not on any DMH, `neededDate` before today.
- Payment (`purchasing_payment_request_overdue_list`): `DRAFT`, `PENDING` or `REJECTED` past `dueDate`.
- OS-OUT (`production_outsourcing_order_overdue_list`): `SENT`, `PARTIAL` or `WAITING_QC` past `expectedReturnDate`; the `report_*` widgets show the 5 worst with no filter.
- JOB operation (`production_job_late_operation_list`): unfinished operation past its own `dueDate`.

## 5. Call flow (`McpServerFactory`, `McpToolInvoker`)
1. `McpServerFactory.create` registers every tool, or only the `?domains=` ones (`listTools`) with `McpServer.registerTool`. A tool not registered is unknown to the SDK: not listed, and `tools/call` answers "Tool X not found". An empty selection returns an empty list (a disabled placeholder keeps the SDK's `tools/list` handler installed).
2. The SDK validates `arguments` against the tool's zod schema before the invoker runs: types, enums, uuid, string <= 500 chars, arrays <= 100 items, unknown keys rejected, `null` and `""` treated as absent, `limit` defaults to 20 and is cut to 50 (`PageOptionsDto` has no maximum). A failure is a plain-text `isError` result (`Input validation error: ...`), not the structured JSON below.
3. `McpToolInvoker.invoke`: query DTO `plainToInstance` + `validate({ whitelist: true })` so DTO-level rules still apply as on REST; path params come straight from the validated arguments; custom params (`@CurrentUser()`) run the decorator factory against a stub request with no user, so the catalog must hide the arguments that need one (`omitArguments`, e.g. `operationId` on `production_job_operation_list` and `production_outsourceable_operation_list`); the registry stops the app for a `@CurrentUser()` route without `omitArguments`.
4. Call the controller method found by `ModuleRef.get(controller, { strict: false })`, serialise with `instanceToPlain`; a result over 500,000 characters becomes a 413 tool error asking for narrower filters.
5. Errors never break the session: DTO validation = 422 `V000` with per-field details; `HttpException` = its status, `errorCode` and message; anything else = 500 "Internal error" (stack only in the server log). These are JSON `{ error: { status, errorCode, message } }` in the tool result.
- The invoker skips the global `ValidationPipe`, `ClassSerializerInterceptor` and `GlobalExceptionFilter` (it does not go through HTTP), so steps 3-5 repeat their job.

## 6. Adding a read route
Add a `GET` handler as usual, then add one `defineMcpTool` entry in the matching `catalog/*.catalog.ts` (or an exclusion rule with a reason). The startup log shows `mcp_route_not_covered` until you do. No other file changes.

## 7. Verification
Live stack on 2026-11-05 after the key-only redesign (local Postgres and Redis, SDK client, build copied to a private directory because `nest build` and `start:dev` wipe `dist/`):
- Boot log `mcp_tools_registered count=137 excluded=38 uncovered=0` (31 - the removed `whoami` + 8 routes tied to the signed-in user: `/users/me`, `/users/me/permissions`, `/reports/pending-approvals`, 5 `production-execution` routes).
- Only `Api-Key` sent: 200 with 137 tools; missing or wrong key 401; a leftover `X-On-Behalf-Of` header is ignored (200); JSON-RPC batch 400; `GET /api/mcp` 405; `GET /api/auth/whoami` 404.
- All 77 tools with no required argument return data; list -> get works (SO, JOB operations); `?domains=quality` returns 11 tools.
- `production_job_operation_list` and `production_outsourceable_operation_list` have no `operationId` in their schema, and sending it is rejected.
- Rate limit by IP: with `MCP_RATE_LIMIT_PER_MINUTE=5` the 6th request from one IP gets 429.
- 2026-11-04 audit fixes (second run): `limit` keeps each summary DTO's own default and maximum, and the page-size cap applies only to paginated DTOs; `pagination.nextPage` and `previousPage` are filled; order value tools convert to VND (the `groupBy=status` total equals `order_stats.totalValue`; the local DB has no foreign-currency order, so the conversion itself was not exercised); `status` and `type` arguments are enums; an impossible date such as 2026-02-30 gives 422.
- The 30 tools that replace the integration gateway were compared with the old `/api/v1/integration` answers (final build): 60 of 63 comparisons matched exactly or as a superset. The three differences are expected: a `status` filter that matches no rows returns `[]` instead of a zero-count row, and the two IQC rate cases return `[]` because the route now counts IQC only while the local data holds only OQC inspections.
