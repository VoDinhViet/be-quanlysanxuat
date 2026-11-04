<!-- Generated: 2026-11-04 | Files scanned: 41 | Token estimate: ~2600 -->
# Reports, files, health, traces & infra codemap

Conventions: controllers check permissions, services do not. The file keeps its old name (`integration.md`) because other docs link it; the `/api/v1/integration/*` gateway no longer exists. Paths: `R`=`src/api/reports`, `T`=`src/api/traces`, `F`=`src/api/files`, `H`=`src/api/health`. Counts verified by reading controllers: reports 7, traces 5, files 5, health 1, plus `GET /auth/whoami` (owned by the MCP module).

Known external breakage: `../ai-platform` (separate repo) still calls the removed `/api/v1/integration/*` routes and the old `whoami` path. It must move to the MCP server (`POST /api/mcp`, see `mcp.md`) and `GET /api/auth/whoami`.

## 1. Modules
- `R/` : `reports.controller.ts` 106, `reports.service.ts` 926, `dto/` 10 files. Imports AuthModule (for `PermissionsService`, `reports.module.ts:8`). Read-only; owns no business rule, re-reads rules of orders, production, quality, purchasing, inventory.
- `T/` (cross-domain trace, read-only): `traces.controller.ts` 116, `traces.service.ts` 259, query helpers `traces.{order 210, purchase 395, supplier 233, item 193, shared 43}.query.ts`, `traces.constant.ts` 37, `dto/` 5 files, `traces.module.ts` (no imports; reads through the global `DRIZZLE` db).
- `F/`: `files.controller.ts` 107, `files.service.ts` 380, `files-cleanup.service.ts` 79, `dto/` 6 files (incl. `draft-files.req.dto.ts`, `hold-draft-files.res.dto.ts`), `upload-policy.ts` 50, `config/multer.config.ts` 26, `util/file-type.ts` 18.
- `H/`: `health.controller.ts` 32, `indicators/{database 28, redis 36}.health.ts`.
- Shared infra: `src/storage/` (`storage.module.ts` 37 global, `storage-provider.interface.ts` 13 = `save`/`delete` only, `providers/local-disk.storage-provider.ts` 32; only LOCAL driver exists), `src/redis/` (`redis.module.ts` 43 global: Keyv-Redis `CacheModule` TTL 1 week + `BullModule` connection, both from `REDIS_URL`).
- Schemas: `files` (`src/database/schemas/files.ts:121`, `draft_expires_at` :150), `quality_inspections`, `quality_inspection_results`, `quality_inspection_evidences` (`schemas/quality/`).

## 2. Routes (19 total)
Reports (7), `@Controller('reports')`, all GET, all `@ApiAuth` (JWT). Handler lines in `R/reports.controller.ts`.
| Route | Perm | Handler -> Service | Reads |
|---|---|---|---|
| /reports/stats | reports:read | :24 -> `getStats` (service:149) | orders, production_jobs, quality_inspections, outsourcing_orders (`outsourcingOrdersPending` PENDING_APPROVAL needs `outsourcing:approve`, `outsourcingOrdersToProcess` DRAFT/REJECTED/APPROVED needs `outsourcing:update`) |
| /reports/alerts | reports:read | :35 -> `getAlerts` (:163) | production_jobs+production_orders+orders, outsourcing_orders, outbound_orders |
| /reports/job-due-date | reports:read | :46 -> `getJobDueDate` (:184) | production_jobs, production_orders, orders |
| /reports/outsourcing-order-due-date | reports:read | :58 -> `getOutsourcingOrderDueDate` (:210) | outsourcing_orders, suppliers |
| /reports/qc-pass-rate | reports:read | :70 -> `getQcPassRate` (:235) | quality_inspection_results |
| /reports/production-progress | reports:read | :82 -> `getProductionProgress` (:274) | production_jobs, production_orders, orders |
| /reports/pending-approvals | none (JWT only) | :95 -> `getPendingApprovals` (:530) | 20 counts over purchase_requests (incl. `purchaseRequestsToSubmit`: the caller's own DRAFT/REJECTED, needs `purchase-requests:create`), purchase_quotations, purchase_orders, orders, production_orders, inventory_requisitions, outbound_orders, inventory_receipts/issues (`inventoryIssuesToPost` non-SALES DRAFT, `salesIssuesToPost` SALES DRAFT), supplier_returns, payment_requests (`paymentRequestsToSubmit` DRAFT+REJECTED, `paymentRequestsPending` PENDING), ncrs (`ncrsPending` PENDING_APPROVAL needs `ncr:approve`, `ncrsToProcess` OPEN/REJECTED/APPROVED needs `ncr:update`), quality_inspections |

Traces (5), `@Controller('traces')`, all GET, all `@ApiAuth` (JWT), all return `TraceStepResDto[]` (`step`, `code`, `status`, `dueDate`, `quantity`, `parentCode`, `note`; no match = `[]`). Each route needs the read permission of every domain it touches, so a role missing one gets 403 and no partial trace. Each is an MCP tool (`catalog/trace.catalog.ts`). Handler lines in `T/traces.controller.ts`.
| Route | Param | Perm (all required) | Walks |
|---|---|---|---|
| /traces/order :19 -> `traceOrder` | `orderCode` | orders, production, purchasing, purchase-requests, iqc, oqc, outsourcing, inventory `:read` | SO -> LSX -> JOB -> unfinished operations, OQC, OS-OUT -> shortage purchase requests -> DMH -> receipts, IQC, supplier returns, payment requests |
| /traces/purchase :42 -> `tracePurchase` | `code` (purchase request, DMH, receipt, IQC, supplier return or payment request) | purchasing, purchase-requests, iqc, inventory `:read` | both directions: request -> DMH -> receipt, IQC, return, payment |
| /traces/supplier :61 -> `traceSupplier` | `supplier` (code or name keyword) | suppliers, purchasing, purchase-requests, iqc, orders, clients, outsourcing, inventory `:read` | open DMH, recent IQC failures, pending returns, open OS-OUT, SO waiting on those DMH |
| /traces/item-supply :84 -> `traceItemSupply` | `itemCode` | items, inventory, purchase-requests, purchasing, suppliers `:read` | products whose BOM uses the item, open purchase requests and DMH |
| /traces/item-structure :104 -> `traceItemStructure` | `itemCode` | items, inventory, operations `:read` | BOM tree and operations of a product |

Each trace runs in one `repeatable read`, `read only` transaction (`TracesService.readSnapshot`) so the chained queries see the same data. Caps: `TRACE_STEP_LIMIT` 50 rows per step, `BOM_TREE_LIMIT` 200, at most 3 matched items (`MAX_MATCHED_ITEMS`) or suppliers (`MAX_MATCHED_SUPPLIERS`). Code params match `DOCUMENT_CODE_PATTERN` (<= 40 chars); the supplier keyword is <= 80.

Identity (1): `GET /api/auth/whoami`, owned by `McpIdentityController` (`src/api/mcp/mcp-identity.controller.ts`, `@Controller('auth')`), not by the auth module. `@Public()` (skips JWT) with `McpApiKeyGuard` + `McpThrottlerGuard`; header `X-User-Token` (the user's ERP access token, missing = 401) -> `AuthService.getActiveIdentity` (signature, session not blacklisted, credential enabled, user not resigned) + `PermissionsService.getPermissionCodes` -> `{credentialId, userId, username, displayName, permissions[]}`. The token is not stored or echoed. The AI platform uses it to learn the `credentialId` it sends as `X-On-Behalf-Of` to `/api/mcp`. It is an infrastructure route and is excluded from the MCP catalog. See `mcp.md`.

Files (5), `@Controller('files')`, all `@ApiAuth`, none has `@Permissions`:
| Route | Handler -> Service | Tables |
|---|---|---|
| POST /files?type= (multipart `file`) | `F/files.controller.ts:31` -> `upload` (service:121) | writes `files` |
| POST /files/drafts/hold | :59 -> `holdDraftFiles` (:267), body `{fileIds}` max 500, returns `{expiresAt, missingFileIds}` | updates `files.draft_expires_at` of the caller's unlinked uploads, reads `files` |
| POST /files/drafts/release (204) | :73 -> `releaseDraftFiles` (:310) | updates `files.draft_expires_at` of the caller's held, unlinked uploads |
| GET /files/:fileId | :86 -> `getFileById` (:175) | reads `files` (metadata only) |
| DELETE /files/:fileId (204) | :95 -> `deleteFile` (:184) | reads files, quality_inspection_evidences; deletes `files` |

Health (1): GET /health, `@Public`, `H/health.controller.ts:22` -> Terminus check of DB (`SELECT 1`) and Redis (set/get `health:ping`).

## 3. Flows
Reports data sources and derivation:
- `getStats` runs 3 queries in parallel (orders, jobs, QC). Without `startDate`/`endDate` it also returns trend fields; with a range every trend/window field is `null` (`reports.service.ts:125`, :397).
- Trends are computed at read time, no history table: `runningOrdersTrendPercent` = running now vs running with `approvedAt` older than 7 days (:372); `orderDueDateTrendCount` = overdue today minus overdue as of yesterday (:380); `runningJobsTrendCount` = jobs with `startedAt` in last 24h (:423); `jobsWaitingQcTrendCount` = distinct OQC DRAFT jobs now minus those created over 1 day ago (:456). Deltas are therefore >= 0.
- `getQcPassRate`: 7-day series (`generate_series` LEFT JOIN `quality_inspection_results`, one row per day, `null` when no inspection that day), IQC and OQC PASS percent from `decision` (:228). Comment at :222 still says `qc_inspections`; the code reads `quality_inspection_results`.
- `getPendingApprovals`: a count runs only if the caller has the matching approve/create/update permission (or `system:manage`), otherwise 0. Seven warehouse/QC/payment counts (receipts to post, payment requests to submit and pending, supplier returns, issues to post, IQC and OQC to inspect) are not gated. NCR `PENDING_QC` is left out of `ncrsToProcess` because the OQC count already includes it.
- `reports.controller.ts:40` summary of `/reports/alerts` mentions NCR, but `getAlerts` returns only jobDueDate, outsourcingOrderDueDate, upcomingDeliveries.

Files flow (upload then link):
  1. `POST /files?type=` -> multer memory storage, ceiling = max(image, document) size (`F/config/multer.config.ts:22-24`).
  2. `upload`: `UploadType` -> `uploadPolicies` gives `kind` (IMAGE/DOCUMENT/EVIDENCE; never from client) -> size cap per kind (default 5MB image, 10MB document) -> magic-byte MIME detection (`file-type`) vs allowlist -> key `yyyy/mm/dd/<uuid>.<ext>` -> `StorageProvider.save` -> insert `files` with sha256 `checksum`, `linkedAt` null.
  3. Consumer services call `FilesService.linkFiles` (:237) before writing a `*FileId`; it sets `linkedAt` once (E042 if any id missing).
  4. Download is not an API route: `FileResDto.url` is `/<storageKey>`, served by `ServeStaticModule` from `upload.dir` at the domain root, `index:false`, `fallthrough:false` (`src/app.module.ts:92`). No auth on those static URLs.
  5. `FilesCleanupService.sweepOrphans` (`@Cron` hourly, `files-cleanup.service.ts:40`) deletes files with `linkedAt IS NULL` that are either older than `upload.orphanTtl` (default 24h) with no `draftExpiresAt`, or past their `draftExpiresAt`: bytes first, rows second. Needs a long-lived process (in-memory timers).
  6. Form drafts: web "Lưu nháp" keeps uploaded files from step 5 by calling `POST /files/drafts/hold`, which sets `draftExpiresAt = now + upload.draftTtl` (default 30 days, `UPLOAD_DRAFT_TTL`; web `FORM_DRAFT_TTL_DAYS` must match). Removing a file from a draft or clearing/resetting it calls `/drafts/release` (`draftExpiresAt = now`, so the next sweep deletes the file). Both routes touch only files the caller uploaded and that are not linked yet; release also skips files that were never held. Creating the document links the files (`linkedAt`), after which neither the sweep nor release can touch them.

## 4. Key rules and error codes
- E016 invalid file (no file, or detected MIME not allowed for kind), 400; E017 file too large, 413; E042 file not found, 404 (also `linkFiles`); E220 file linked to QC evidence, 409 (blocks `deleteFile`/`deleteFileById`, FK is restrict); E033 forbidden, 403 (delete by non-uploader without `system:manage`).
- `deleteFile` compares `uploadedBy` to `users.id` (`payload.userId`) but permission via `credentials` (`payload.sub`) (`files.service.ts:184`).
- `holdDraftFiles` reports `missingFileIds` (ids no longer in `files`, any owner, same visibility as `GET /files/:fileId` metadata) instead of throwing E042, so the web can drop dead files from a draft; `linkFiles` still throws E042 for the document create/update routes.
- Upload is not permission-checked by type: any authenticated user may upload any `UploadType` (documented decision, `F/upload-policy.ts:20`).
- Trace routes are read-only by construction (`read only` transaction); global `ValidationPipe` errors are 422.
- Health path is excluded from the `api` prefix (`src/main.ts:53`), so it is `GET /health`, not `/api/health`. URI versioning is still enabled (`main.ts:59`) but no controller declares a version.

## 5. Cross-domain links
- Reports read orders/SO, production (LSX, JOB), outsourcing, outbound (DO), inventory, purchasing and quality (IQC/OQC) tables directly; see `production.md`, `sales.md`, `purchasing.md`, `inventory.md`, `quality.md`. Reuses `PermissionsService` from `identity-access.md`.
- Trace queries read orders, clients, production_*, outsourcing_orders, purchase_*, payment_requests, inventory_receipts/balances, supplier_returns, suppliers, items, boms, bom_operations and quality_inspections directly (plain functions in `T/*.query.ts`, no service of another module). `TracesModule` imports nothing; MCP wraps its controller through `ModuleRef`. Traces do not read the `ncrs` table; reports read it only for the two NCR counts of `getPendingApprovals`.
- `FilesService.linkFiles`/`deleteFileById` are called by consumer modules (users, items, orders, BOMs, quality); `FilesService` also reads `quality_inspection_evidences` (`quality.md`). `RedisModule` cache backs `PermissionsService` lookups (unverified), BullMQ queues are registered globally.
