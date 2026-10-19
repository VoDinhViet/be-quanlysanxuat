<!-- Generated: 2026-10-19 | Files scanned: 42 | Token estimate: ~2690 -->
# Integration, reports & files codemap

Conventions: controllers check permissions, services do not. Paths: `R`=`src/api/reports`, `I`=`src/api/integration`, `F`=`src/api/files`, `H`=`src/api/health`. Counts verified by reading controllers: reports 7, integration 22, files 3, health 1.

## 1. Modules
- `R/` : `reports.controller.ts` 106, `reports.service.ts` 797, `dto/` 10 files. Imports AuthModule (for `PermissionsService`, `reports.module.ts:8`). Read-only; owns no business rule, re-reads rules of orders, production, quality, purchasing, inventory.
- `I/` (AI platform read gateway): 5 controllers (identity 57, orders 128, production 72, purchasing 102, quality 60), services (orders 325, production 114, purchasing 191, quality 124), `integration-query.service.ts` 114 (shared SQL runner), `guards/` (api-key 57, on-behalf 91), `dto/` 5 files, `integration.module.ts` 61 (registers its own `ThrottlerModule`, limit from `integration.rateLimitPerMinute`, :36).
- `F/`: `files.controller.ts` 77, `files.service.ts` 279, `files-cleanup.service.ts` 70, `upload-policy.ts` 50, `config/multer.config.ts` 26, `util/file-type.util.ts` 18.
- `H/`: `health.controller.ts` 32, `indicators/{database 28, redis 36}.health.ts`.
- Shared infra: `src/storage/` (`storage.module.ts` 37 global, `storage-provider.interface.ts` 13 = `save`/`delete` only, `providers/local-disk.storage-provider.ts` 32; only LOCAL driver exists), `src/redis/` (`redis.module.ts` 43 global: Keyv-Redis `CacheModule` TTL 1 week + `BullModule` connection, both from `REDIS_URL`).
- Schemas: `files` (`src/database/schemas/files.ts:112`), `quality_inspections`, `quality_inspection_results`, `quality_inspection_evidences` (`schemas/quality/`).

## 2. Routes (33 total)
Reports (7), `@Controller('reports')`, all GET, all `@ApiAuth` (JWT). Handler lines in `R/reports.controller.ts`.
| Route | Perm | Handler -> Service | Reads |
|---|---|---|---|
| /reports/stats | reports:read | :24 -> `getStats` (service:142) | orders, production_jobs, quality_inspections |
| /reports/alerts | reports:read | :35 -> `getAlerts` (:156) | production_jobs+production_orders+orders, outsourcing_orders, outbound_orders |
| /reports/job-due-date | reports:read | :46 -> `getJobDueDate` (:177) | production_jobs, production_orders, orders |
| /reports/outsourcing-order-due-date | reports:read | :58 -> `getOutsourcingOrderDueDate` (:203) | outsourcing_orders, suppliers |
| /reports/qc-pass-rate | reports:read | :70 -> `getQcPassRate` (:228) | quality_inspection_results |
| /reports/production-progress | reports:read | :82 -> `getProductionProgress` (:267) | production_jobs, production_orders, orders |
| /reports/pending-approvals | none (JWT only) | :95 -> `getPendingApprovals` (:522) | 15 counts over purchase_requests (incl. `purchaseRequestsToSubmit`: the caller's own DRAFT/REJECTED, needs `purchase-requests:create`), purchase_quotations, purchase_orders, orders, production_orders, inventory_requisitions, outbound_orders, inventory_receipts/issues, supplier_returns, payment_requests, quality_inspections |

Integration (22), `@Controller({ path: 'integration', version: '1' })`, all GET, all `@ApiPublic`, all return `IntegrationResultResDto` {columns, rows, truncated}. Every query is a fixed SQL template via `IntegrationQueryService.run` (`I/integration-query.service.ts:77`).
- Identity (1): GET /integration/auth/whoami (header `X-User-Token`) -> `AuthService.getActiveIdentity` + `PermissionsService.getPermissionCodes` (`I/integration-identity.controller.ts:39`). Guards: API key + throttler only, no on-behalf guard.
- Orders (8, `integration-orders.controller.ts`): count-by-status (:30, no `@Permissions`; permission derived from `entity` query param, tables orders/production_jobs/production_orders/payment_requests/inventory_receipts), order-value-over-time (:42), top-clients-by-order-value (:55), top-orders-by-value (:67), overdue-orders (:80), pending-deliveries (:92, outbound_orders), order-progress (:105, orders+production_orders+production_jobs), count-clients (:117, clients:read). Others need `orders:read`.
- Production (4): open-production-orders (:26), production-jobs-by-item (:36), late-job-operations (:48, production_job_operations), all `production:read`; operations-by-type (:61, `operations:read`).
- Purchasing (6): inventory-ranking (:29, inventory:read, inventory_balances), purchase-value-by-supplier (:42), overdue-purchase-orders (:54, joins inventory_receipt_items for received qty), overdue-payment-requests (:78), payment-request-value (:90), all `purchasing:read`; stuck-purchase-requests (:66, `purchase-requests:read`).
- Quality (3, all `iqc:read`): quality-inspection-rate (:24), iqc-fail-by-supplier (:37), open-ncr (:50).

Files (3), `@Controller('files')`, all `@ApiAuth`, none has `@Permissions`:
| Route | Handler -> Service | Tables |
|---|---|---|
| POST /files?type= (multipart `file`) | `F/files.controller.ts:28` -> `upload` (service:119) | writes `files` |
| GET /files/:fileId | :56 -> `getFileById` | reads `files` (metadata only) |
| DELETE /files/:fileId (204) | :65 -> `deleteFile` (:182) | reads files, quality_inspection_evidences; deletes `files` |

Health (1): GET /health, `@Public`, `H/health.controller.ts:22` -> Terminus check of DB (`SELECT 1`) and Redis (set/get `health:ping`).

## 3. Flows
Integration auth (request order, all set at controller level via `@UseGuards`):

  global JwtAuthGuard (skipped: @Public via ApiPublic) -> PermissionsGuard (skipped, `auth/guards/permissions.guard.ts:45`)
    -> IntegrationApiKeyGuard -> IntegrationOnBehalfGuard -> ThrottlerGuard -> IntegrationQueryService.run

- `IntegrationApiKeyGuard` (`I/guards/integration-api-key.guard.ts:34`): header `Api-Key` vs env `INTEGRATION_API_KEY` (min 32 chars), SHA-256 digest + `timingSafeEqual`; unset key = 401 for every call (group disabled).
- `IntegrationOnBehalfGuard` (`I/guards/integration-on-behalf.guard.ts:47`): no `X-On-Behalf-Of` header = pass (internal admin Ask, key only). Header present = must match UUID pattern, then the credential's permissions must include `SUPER_PERMISSION` or every `@Permissions` of the route; a route with no declared permission and no known `entity` is denied (closed by default). Failure = 403 E033.
- Query runner: `SET TRANSACTION READ ONLY` + `SET LOCAL statement_timeout` (`integration.queryTimeoutMs`, default 10s), cut at `MAX_ROWS` 1000 (`truncated` flag), Postgres 57014 -> 504, one log line per call without params. DTO caps: `limit` max 50, "N days" max 365 (`dto/integration-common.dto.ts:11`). "Today" is Asia/Ho_Chi_Minh (`TODAY`, `I/integration-query.service.ts:24`).

Reports data sources and derivation:
- `getStats` runs 3 queries in parallel (orders, jobs, QC). Without `startDate`/`endDate` it also returns trend fields; with a range every trend/window field is `null` (`reports.service.ts:125`, :397).
- Trends are computed at read time, no history table: `runningOrdersTrendPercent` = running now vs running with `approvedAt` older than 7 days (:372); `orderDueDateTrendCount` = overdue today minus overdue as of yesterday (:380); `runningJobsTrendCount` = jobs with `startedAt` in last 24h (:423); `jobsWaitingQcTrendCount` = distinct OQC DRAFT jobs now minus those created over 1 day ago (:456). Deltas are therefore >= 0.
- `getQcPassRate`: 7-day series (`generate_series` LEFT JOIN `quality_inspection_results`, one row per day, `null` when no inspection that day), IQC and OQC PASS percent from `decision` (:228). Comment at :222 still says `qc_inspections`; the code reads `quality_inspection_results`.
- `getPendingApprovals`: a count runs only if the caller has the matching approve/create/update permission (or `system:manage`), otherwise 0. Six warehouse/QC/payment counts (receipts to post, payment requests, supplier returns, issues to post, IQC and OQC to inspect) are not gated.
- `reports.controller.ts:40` summary of `/reports/alerts` mentions NCR, but `getAlerts` returns only jobDueDate, outsourcingOrderDueDate, upcomingDeliveries.

Files flow (upload then link):
  1. `POST /files?type=` -> multer memory storage, ceiling = max(image, document) size (`F/config/multer.config.ts:22-24`).
  2. `upload`: `UploadType` -> `uploadPolicies` gives `kind` (IMAGE/DOCUMENT/EVIDENCE; never from client) -> size cap per kind (default 5MB image, 10MB document) -> magic-byte MIME detection (`file-type`) vs allowlist -> key `yyyy/mm/dd/<uuid>.<ext>` -> `StorageProvider.save` -> insert `files` with sha256 `checksum`, `linkedAt` null.
  3. Consumer services call `FilesService.linkFiles` (:220) before writing a `*FileId`; it sets `linkedAt` once (E042 if any id missing).
  4. Download is not an API route: `FileResDto.url` is `/<storageKey>`, served by `ServeStaticModule` from `upload.dir` at the domain root, `index:false`, `fallthrough:false` (`src/app.module.ts:92`). No auth on those static URLs.
  5. `FilesCleanupService.sweepOrphans` (`@Cron` hourly, `files-cleanup.service.ts:38`) deletes files with `linkedAt IS NULL` older than `upload.orphanTtl` (default 24h): bytes first, rows second. Needs a long-lived process (in-memory timers).

## 4. Key rules and error codes
- E016 invalid file (no file, or detected MIME not allowed for kind), 400; E017 file too large, 413; E042 file not found, 404 (also `linkFiles`); E220 file linked to QC evidence, 409 (blocks `deleteFile`/`deleteFileById`, FK is restrict); E033 forbidden, 403 (delete by non-uploader without `system:manage`; on-behalf denial).
- `deleteFile` compares `uploadedBy` to `users.id` (`payload.userId`) but permission via `credentials` (`payload.sub`) (`files.service.ts:182`).
- Upload is not permission-checked by type: any authenticated user may upload any `UploadType` (documented decision, `F/upload-policy.ts:20`).
- Integration group is read-only by construction; global `ValidationPipe` errors are 422.
- Health path is excluded from the `api` prefix (`src/main.ts:51`), so it is `GET /health`, not `/api/health`. Integration is URI-versioned (`main.ts:57`): `GET /api/v1/integration/...`.

## 5. Cross-domain links
- Reports read orders/SO, production (LSX, JOB), outsourcing, outbound (DO), inventory, purchasing and quality (IQC/OQC) tables directly; see `production.md`, `sales.md`, `purchasing.md`, `inventory.md`, `quality.md`. Reuses `PermissionsService` from `identity-access.md`.
- Integration SQL reads orders, clients, users, production_*, items, inventory_balances/receipts, purchase_* and payment_requests, suppliers, quality_inspections. Nothing in reports or integration reads the `ncrs` table: `open-ncr` (`I/integration-quality.service.ts:110`) is FAIL decisions in `quality_inspections` (status not CANCELLED, and not COMPLETED-with-disposition).
- `FilesService.linkFiles`/`deleteFileById` are called by consumer modules (users, items, orders, BOMs, quality); `FilesService` also reads `quality_inspection_evidences` (`quality.md`). `RedisModule` cache backs `PermissionsService` lookups (unverified), BullMQ queues are registered globally.
