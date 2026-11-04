<!-- Generated: 2026-11-04 | Files scanned: 24 | Token estimate: ~2100 -->
# MCP server codemap

Read-only Model Context Protocol endpoint for the company's internal chat agent. Paths: `M`=`src/api/mcp`. Citations are file paths.

## 1. What it is
- One endpoint, `POST /api/mcp` (Streamable HTTP, stateless, JSON responses instead of SSE). `GET` and `DELETE` return 405. Swagger hides it (`@ApiExcludeController`).
- 145 tools. Every tool is an existing `GET` controller method; nothing is re-implemented. Permissions, description and input schema are read from that route's metadata, so REST and MCP cannot drift.
- Disabled unless `MCP_API_KEY` is set (>= 32 chars, `src/config/mcp.config.ts`). Unset key = every request 401 and no tool is registered (`McpToolsRegistry.onApplicationBootstrap`).
- The module also owns `GET /api/auth/whoami` (section 8), which is not a tool.
- Known external breakage: `../ai-platform` (separate repo) still calls the removed `/api/v1/integration/*` routes and the old `whoami` path. It must move to this endpoint (`POST /api/mcp`) and `GET /api/auth/whoami`.

## 2. Request flow
  `@Public()` (skips global JwtAuthGuard and PermissionsGuard) -> `McpApiKeyGuard` -> `McpThrottlerGuard` -> `McpCallerGuard` -> `McpController.handleRequest` -> `McpServerFactory.create` -> SDK `McpServer` + `StreamableHTTPServerTransport` -> `McpToolInvoker.invoke` -> controller method (via `ModuleRef`).

- `McpApiKeyGuard` (`M/guards/mcp-api-key.guard.ts`): header `Api-Key` vs `MCP_API_KEY` through `secureCompare` (sha256 + `timingSafeEqual`, `src/common/utils/secure-compare.ts`). Missing or wrong = 401.
- `McpCallerGuard` (`M/guards/mcp-caller.guard.ts`): header `X-On-Behalf-Of` must be a credential uuid, else 403 `E033`. In parallel it calls `AuthService.getActiveCredentialIdentity` (unknown credential = 403 `E033`; disabled credential or resigned user = 403 `E018`, effective on the next request) and `PermissionsService.getPermissionCodes`, then sets `request.mcpCaller` with a synthetic `JwtPayloadType` (`sessionId: 'mcp'`, 60 s expiry) that `@CurrentUser()` reads.
- `McpThrottlerGuard` (`M/guards/mcp-throttler.guard.ts`): only the tracker. The limit comes from `McpModule`'s own `ThrottlerModule.forRootAsync` (`mcp.rateLimitPerMinute`, `MCP_RATE_LIMIT_PER_MINUTE`, default 120), counted per `X-On-Behalf-Of` uuid (IP when the header is not a uuid), not per IP, because the agent calls from one host. It runs before `McpCallerGuard` so a throttled request costs no DB query.
- `McpController.handleRequest` (`M/mcp.controller.ts`): builds a fresh server and transport per request (the tool list depends on the caller), passes `request.body` because the 1 MB body parser already consumed the stream, closes both on response close. Optional `?domains=sales,inventory` limits `tools/list` (422 `V000` for an unknown domain).
- The key holder can name any credential, so it can act as any employee. The key is the trust boundary: keep it only in the agent's secret store.

## 3. How a tool is built
- `MCP_CATALOG` (`M/catalog/index.ts`) lists entries made by `defineMcpTool` (`M/catalog/define-mcp-tool.ts`): `name`, Vietnamese `title`, English `hint`, `controller`, `method`. `method` is typed `keyof` the controller, so a wrong name fails `tsc`.
- `McpToolsRegistry.buildTool` (`M/registry/mcp-tools.registry.ts`) derives the rest:
  | Tool property | Source |
  |---|---|
  | permissions | `@Permissions` on the method, else on the class; `@Public` = none (same rule as `PermissionsGuard`) |
  | description | swagger `apiOperation.summary` + catalog `hint` (+ paging note when `page` and `limit` exist) |
  | input schema | zod object built by `readToolInput` from `readHandlerArgs` (`M/registry/handler-args.ts`): `@Query() Dto` -> `buildDtoShape` (`M/registry/dto-zod-schema.ts`, reads the swagger metadata written by `src/decorators/field.decorators.ts`); `@UUIDParam('x')` -> required `x` (`z.string().uuid()`); `@CurrentUser()` -> no input. The object is `.strict()` (unknown argument = error) and the SDK converts it to JSON Schema for `tools/list` |
- Only `@Query() Dto`, `@Param('x')` and custom param decorators are supported. Any other parameter kind (body, request, response) throws at boot (`mcp_unsupported_handler_arg`), as do a catalog entry that is not a `GET`, a bad name, a duplicate name, a duplicated parameter, a path param without `ParseUUIDPipe`, or a route whose swagger `summary` is missing (canary for a renamed swagger metadata key).
- Startup log `mcp_tools_registered count=145 excluded=31 uncovered=0` (`reportRouteCoverage`). Every `GET` route is either in the catalog or matched by `MCP_EXCLUDED_ROUTES` (`M/catalog/excluded-routes.ts`: file downloads and import templates, UI dropdown routes, and the infrastructure controllers `AppController`, `AuthController`, `FilesController`, `HealthController`, `McpController`, `McpIdentityController`); anything else logs `mcp_route_not_covered`.

## 4. Naming
`[<domain>_]<entity>_<action>`, lowercase snake_case, <= 64 chars. The `sales` domain (clients, SO, DO) has no prefix because the old modules were never called that: its tools are named after the module (`client_list`, `order_list`, `outbound_order_list`, `order_trace_get`) and the catalog entries declare `domain: 'sales'`; every other tool starts with its domain. A name that does not start with a domain must declare one or the registry stops the app. Domains (the `?domains=` values): `sales`, `purchasing`, `inventory`, `product`, `production`, `quality`, `report`, `org`. Actions: `list` (filter and paginate), `get` (one document by uuid), `stats`, `summary`. Trace tools end in `_trace_get`. Detail lines are `line`, chain notes `note`, history `log`. The registry rejects a name outside this pattern.

| Domain | Tools | Catalog file |
|---|---|---|
| sales | 19 | `catalog/sales.catalog.ts` (clients, SO, DO) |
| purchasing | 25 | `purchasing.catalog.ts` (suppliers, requests, RFQ, DMH, payment requests, ledger) |
| inventory | 21 | `inventory.catalog.ts` (balances, ledger, receipts, issues, requisitions, adjustments, supplier returns) |
| product | 15 | `product.catalog.ts` (items, BOM, routing, operations, categories, units) |
| production | 31 | `production.catalog.ts` (LSX, JOB, shop floor, OS-OUT, OS-IN) |
| quality | 11 | `quality.catalog.ts` (IQC, OQC, NCR) |
| report | 7 | `report.catalog.ts` (reports controller) |
| org | 11 | `org.catalog.ts` (me, users, departments, positions, countries, roles) |
| (trace) | 5 | `trace.catalog.ts` (`TracesController`; names are `order_trace_get`, `purchasing_document_trace_get`, `purchasing_supplier_trace_get`, `product_item_supply_trace_get`, `product_item_structure_trace_get`) |

Counts are `defineMcpTool` entries per file (total 145). A tool's domain is its name prefix (or the declared `domain` for `sales`), not its file: `inventory_supplier_return_summary` is named for the inventory domain and sits in `inventory.catalog.ts`. 30 of the 145 tools are the former integration queries: 25 ordinary `GET` summary routes of the owning modules (`sales.md`, `purchasing.md`, `inventory.md`, `production.md`, `quality.md`; JWT + `@Permissions` like any route) and the 5 traces (`integration.md`).

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
1. `McpServerFactory.create` registers with `McpServer.registerTool` only the tools the caller may use (`listVisibleTools`; `system:manage` sees all). A forbidden tool is therefore unknown to the SDK: not listed, and `tools/call` answers "Tool X not found". A caller with no tool gets an empty list (a disabled placeholder keeps the SDK's `tools/list` handler installed).
2. The SDK validates `arguments` against the tool's zod schema before the invoker runs: types, enums, uuid, string <= 500 chars, arrays <= 100 items, unknown keys rejected, `null` and `""` treated as absent, `limit` defaults to 20 and is cut to 50 (`PageOptionsDto` has no maximum). A failure is a plain-text `isError` result (`Input validation error: ...`), not the structured JSON below.
3. `McpToolInvoker.invoke`: query DTO `plainToInstance` + `validate({ whitelist: true })` so DTO-level rules still apply as on REST; path params come straight from the validated arguments; custom params (`@CurrentUser()`) run the decorator factory against a stub request holding the caller.
4. Call the controller method found by `ModuleRef.get(controller, { strict: false })`, serialise with `instanceToPlain`; a result over 500,000 characters becomes a 413 tool error asking for narrower filters.
5. Errors never break the session: DTO validation = 422 `V000` with per-field details; `HttpException` = its status, `errorCode` and message; anything else = 500 "Internal error" (stack only in the server log). These are JSON `{ error: { status, errorCode, message } }` in the tool result.
- The invoker skips the global `ValidationPipe`, `ClassSerializerInterceptor` and `GlobalExceptionFilter` (it does not go through HTTP), so steps 3-5 repeat their job.

## 6. Adding a read route
Add a `GET` handler as usual, then add one `defineMcpTool` entry in the matching `catalog/*.catalog.ts` (or an exclusion rule with a reason). The startup log shows `mcp_route_not_covered` until you do. No other file changes.

## 7. Verification
Live stack on 2026-11-04 (local Postgres and Redis, BE built from the zod/`McpServer` code, SDK client):
- 2026-11-04 audit fixes (second run): `limit` keeps each summary DTO's own default and maximum, and the page-size cap applies only to paginated DTOs; `pagination.nextPage` and `previousPage` are filled; order value tools convert to VND (the `groupBy=status` total equals `order_stats.totalValue`; the local DB has no foreign-currency order, so the conversion itself was not exercised); `status` and `type` arguments are enums; an impossible date such as 2026-02-30 gives 422.
- Boot log `mcp_tools_registered count=145 excluded=31 uncovered=0` (excluded fell from 65 to 31 because the 35 integration routes are gone, and `McpIdentityController` was added).
- 401 for missing or wrong key; 403 for missing, malformed (including 36 dashes) or unknown `X-On-Behalf-Of`; 400 for a JSON-RPC batch; 405 for `GET`.
- Admin: all tools with no required argument return data; list -> get chains work for SO, supplier, JOB, NCR, item and receipt; `limit` 100000 is cut to 50; `status` filter and empty `q` behave; bad enum, missing id and unknown key give SDK validation errors; unknown order gives a 404 tool error; `org_me_get` returns the caller; `?domains=quality` lists only quality tools.
- Limited role (`nvsanxuat10`): `order_list` neither listed nor callable, `org_me_get` returns that employee.
- Disabled credential: 403 `E018` on the next request, 200 again after re-enabling.
- Rate limit: with `MCP_RATE_LIMIT_PER_MINUTE=5`, the 6th request of one credential gets 429 while another credential still gets 200.
- The 30 tools that replace the integration gateway were compared with the old `/api/v1/integration` answers (final build): 60 of 63 comparisons matched exactly or as a superset. The three differences are expected: a `status` filter that matches no rows returns `[]` instead of a zero-count row, and the two IQC rate cases return `[]` because the route now counts IQC only while the local data holds only OQC inspections.
- `GET /api/auth/whoami`: 401 without key, with a wrong key, without `X-User-Token` and with a garbage token; the success path (valid user token) was not exercised. `/api/v1/integration/*` returns 404.
