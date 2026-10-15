<!-- Generated: 2026-10-15 | Files scanned: 58 | Token estimate: ~2740 -->
# Architecture Codemap

**Last Updated:** 2026-10-15
**Entry Points:** `src/main.ts`, `src/app.module.ts`
**Stack:** NestJS 11 modular monolith, Drizzle ORM + postgres.js, Redis (Keyv cache + BullMQ connection), pnpm, Node >= 24. Companion: `docs/CODEMAPS/data.md` (schema).

## Bootstrap (`src/main.ts`)
- Lines 1-3: dotenv loads `.env.${NODE_ENV || 'local'}` then `.env`. `ConfigModule.forRoot` (`src/app.module.ts:69`) uses the list `.env.${NODE_ENV||'local'}`, `.env.local`, `.env`; first file wins per key. `pnpm start:dev` sets `NODE_ENV=local`.
- `bootstrap()` (`main.ts:29`) exports an Express instance; default export `handler(req,res)` also supports serverless. `instance.listen(PORT || 3000)` runs only when `require.main === module` (`main.ts:95`).
- Order: `trust proxy`, helmet (cross-origin resource policy), compression, CORS (`app.corsOrigin`), global prefix `api` (excluded: `GET /`, `GET health`), URI versioning enabled (`main.ts:57`, only integration controllers use `version: '1'`), `GlobalExceptionFilter`, `ValidationPipe`, `ClassSerializerInterceptor`.
- `ValidationPipe`: `transform`, `whitelist`, validation failures raise `UnprocessableEntityException` (HTTP 422) (`main.ts:60`).
- Swagger at `/api-docs` (`src/utils/swagger.util.ts`) with Bearer and `Api-Key` schemes, mounted whenever `NODE_ENV !== production`.

## Module registration (`src/app.module.ts`)
- Global infrastructure: `DatabaseModule` (token `DRIZZLE`, `src/database/database.module.ts`), `RedisModule`, `StorageModule`, `ServeStaticModule` (serves `upload.dir` at the domain root, no auth; storage key is the public path), `ScheduleModule` (cron `FilesCleanupService` hourly, `src/api/files/files-cleanup.service.ts:37`; timers only in a long-lived process).
- ~45 domain modules, one per folder in `src/api/` (auth, users, roles, clients, items, boms, routings, orders, production-*, iqc, oqc, ncrs, inventory-*, outsourcing-*, supplier-returns, purchase-*, payment-requests, reports, integration, files, health ...). Each is imported in `imports: [...]`.
- Global guards (`app.module.ts:163-164`, order matters): `JwtAuthGuard` then `PermissionsGuard`.
- Config loaders (`load:`): app, auth, database, redis, upload, integration; typed by `AllConfigType` (`src/config/config.type.ts`). Each is a `registerAs` factory + env validator class run through `src/utils/validate-config.ts`; a missing required var stops boot. Env keys (`.env.example`): PORT, DATABASE_URL, DATABASE_SSL_MODE, FRONTEND_DOMAIN, BACKEND_DOMAIN, AUTH_JWT_*, AUTH_REFRESH_*, REDIS_URL, UPLOAD_*, INTEGRATION_*.

## Request flow

```
client --HTTP--> helmet/compression/CORS (Express)
   --> JwtAuthGuard        (skip if @Public; Bearer JWT -> request.user; session blacklist in Redis)
   --> PermissionsGuard    (@Permissions codes; 'system:manage' passes all; else AppException E033 403)
   --> ClassSerializerInterceptor
   --> ValidationPipe      (DTO whitelist/transform; fail = 422)
   --> Controller          (thin: @Permissions + @ApiAuth, returns service result)
   --> Service             (business rules, db.transaction)
   --> *.query.ts / *.write.ts   (plain functions taking Database | DbTransaction)
   --> Drizzle (DRIZZLE token) --> postgres.js --> PostgreSQL
 exceptions at any step --> GlobalExceptionFilter --> ErrorDto JSON
```

## Auth and permissions
- JWT payload (`src/api/auth/types/jwt-payload.type.ts`): `sub` = credential id (table `credentials`), `userId` = users.id, `username`, `email`, `sessionId`. `@CurrentUser()` returns it.
- `verifyAccessToken` (`auth.service.ts:172`) checks signature then `CacheKey.SESSION_BLACKLIST` in Redis (`src/constants/cache.constant.ts`).
- Permission codes: `PERMISSION_CODES` array (`src/constants/permission.constant.ts:12`) of `resource:action`, `SUPER_PERMISSION = 'system:manage'`, plus labels and `PERMISSION_CATALOGUE_GROUPS`. Roles in DB reference these codes. Only controllers check permissions; services do not (`.claude/rules/api-conventions.md`). `PermissionsService.getPermissionCodes(credentialId)` is for non-controller callers.
- Integration routes (`src/api/integration/`, `/api/v1/integration/*`): `@ApiPublic` skips JWT; guarded instead by `IntegrationApiKeyGuard` (header `api-key`, env `INTEGRATION_API_KEY`, route group off when unset), `IntegrationOnBehalfGuard`, `ThrottlerGuard`.

## Per-domain file convention (`src/api/<domain>/`)
`<d>.module.ts`, `<d>.controller.ts`, `<d>.service.ts`, optional `<d>.query.ts` (20 domains: read helpers/joins), `<d>.write.ts` (3 domains: ncrs, iqc, inventory-receipts; transactional write helpers, e.g. `ncrs.write.ts` `generateNcrCode(tx)`), `<d>.constant.ts` (inventory, production-execution, purchase-ledger, purchase-orders), `<d>.export.ts` (Excel, e.g. orders, iqc, oqc, items), `dto/` (`*.req.dto.ts`, `*.res.dto.ts`, `*-ref.res.dto.ts` for narrow refs). Query/write helpers are plain functions, not providers, so modules avoid circular imports (see comment `ncrs.write.ts`: OqcModule deliberately does not import NcrsModule). Reference example: `src/api/ncrs/`.

## Shared code
- `src/common/dto/offset-pagination/` (`PageOptionsDto` limit/page/q/order, getter `offset`; `OffsetPaginatedDto {data, pagination}` with `OffsetPaginationDto` totalRecords/totalPages) and `cursor-pagination/`; `error.dto.ts`, `error-detail.dto.ts`. Default limit 10 (`DEFAULT_PAGE_LIMIT`), no max limit.
- `src/common/utils/`: `document-sequence.util.ts`, `search.util.ts` (`unaccentILike`), `date-range.util.ts`, `excel.util.ts`, `vnd.util.ts`, `postgres-error.util.ts`, `array.util.ts`, `object.util.ts`.
- `src/decorators/`: `field.decorators.ts` (`StringField`, `UUIDField`, `EnumField`, `ClassField`, ... each with `*Optional`), `http.decorators.ts` (`ApiAuth`, `ApiPublic`), `permissions.decorator.ts`, `public.decorator.ts`, `current-user.decorator.ts`, `param.decorators.ts` (`UUIDParam`), `validators/`.
- `src/constants/`: `error-code.constant.ts` (enum `ErrorCode`, ~700 lines: `E###` business, `V###` validation, values like `ncr.error.job_required`; retired codes stay reserved), `permission.constant.ts`, `app.constant.ts` (`Environment`, `OrderBy`, paging defaults), `cache.constant.ts`, `role.constant.ts`.
- `src/redis/`: `RedisModule` (global) gives a Keyv-Redis `CacheModule` (TTL 1 week) and `BullModule.forRootAsync` connection from `REDIS_URL`. No queue is registered and no `@Processor`/`InjectQueue` exists in `src` (grep): BullMQ is wiring only.
- `src/storage/`: `STORAGE_PROVIDER` symbol, `LocalDiskStorageProvider` (only driver; `UPLOAD_DRIVER=local`, dir `uploads/`). Upload policies per `UploadType` in `src/api/files/upload-policy.ts`; hourly cleanup of orphan files (`UPLOAD_ORPHAN_TTL`).
- `src/templates/`: `TemplatesModule` exports `PdfRendererService` (Puppeteer/Chromium, init/destroy hooks, `render(type, ctx) -> Buffer`); `form-templates.registry.ts` maps `FormTemplateType` (ORDER, ORDER_SUMMARY, PRODUCTION_ORDER, PRODUCTION_PLAN, STOCK_IN_SLIP) to static `*.html`; copied to `dist/src/templates` via `nest-cli.json` assets. Specs importing the renderer must `jest.mock` it (puppeteer is ESM-only).
- `src/test-utils/chainable-mock.util.ts` (`chainableMock`): thenable mock of Drizzle's fluent builder for service specs. `test/` holds only `app.e2e-spec.ts`.
- `src/utils/`: `validate-config.ts`, `swagger.util.ts`, `cache.util.ts` (`createCacheKey`).

## Document code generation
Table `document_sequences` (`src/database/schemas/document-sequences.ts`, unique `(document_type, year)`, `year = 0` for non-yearly docs). `generateDocumentSequence(tx, DocumentType, year)` in `src/common/utils/document-sequence.util.ts` is one atomic `INSERT ... ON CONFLICT DO UPDATE ... RETURNING`; it must run inside the open transaction that creates the document (row lock serialises concurrent creators). `generateDocumentSequences(tx, type, year, n)` reserves n consecutive numbers (IQC batches). `DocumentType` enum (23 values: ORDER, PRODUCTION_ORDER, NCR, IQC, OQC, INVENTORY_RECEIPT, PURCHASE_ORDER, PAYMENT_REQUEST, ...). The service formats the prefix/code; used by ~20 services (grep `document-sequence`).

## Errors and responses
- Throw `new AppException(ErrorCode.X, HttpStatus.Y, message?, details?)` (`src/exceptions/app.exception.ts`; default status 400).
- `GlobalExceptionFilter` (`src/filters/global-exception.filter.ts`) maps: AppException -> its status + `errorCode`; 400/422 validation -> `details[{property, code, message}]`, message "Validation failed"; `PayloadTooLargeException` -> E017; other HttpException; Postgres 23505 -> 409, 23503 -> 400; drizzle "No values to set" -> 400 `V004`; anything else 500. Body is `ErrorDto {timestamp, statusCode, error, errorCode?, message, details?}`. ENOENT paths are scrubbed.
- Responses: `@Exclude()` class + `@Expose()` fields, built with `plainToInstance(Dto, value, { excludeExtraneousValues: true })` (e.g. `ncrs.service.ts:96`); narrow DTOs via `PickType`. Create/update preferably return `void` (204, `ApiAuth({ statusCode: HttpStatus.NO_CONTENT })`).

## Add a new endpoint
1. Add a `resource:action` code to `PERMISSION_CODES` and `PERMISSION_LABELS` (and catalogue group) in `permission.constant.ts` if new.
2. Add request/response DTOs in `dto/` using field decorators and `@Exclude/@Expose`; lists extend `PageOptionsDto`.
3. Add an `ErrorCode` for each new business failure in `error-code.constant.ts` (next free `E###`).
4. Put DB logic in the service (use `this.db` via `@Inject(DRIZZLE)`, `db.transaction` for multi-write) or `*.query.ts`/`*.write.ts` helpers; filter `deletedAt` where the table has it.
5. Add the controller method with `@Permissions(...)` and `@ApiAuth({ type, summary, isPaginated? })`; register controller/provider in the domain module, and the module in `AppModule` if new.
6. If a schema change is needed, edit `src/database/schemas/**`, export from `index.ts`, then ask the user to run `pnpm db:generate`.
7. Verify with `npx tsc --noEmit` and `pnpm lint`. Project rules: no tests unless asked, no commit unless ordered.

## Deployment (visible in repo)
- `Dockerfile` (multi-stage, node:24-bookworm-slim, Chromium from Debian for PDF, `PORT=8003`, user `node`, HEALTHCHECK on `/health`, `CMD node dist/src/main.js`; output path depends on `drizzle.config.ts` being compiled).
- `docker-compose.yml`: services `app` (container `qlsx-backend`, env `.env.production`, binds `127.0.0.1:8003`, uploads bind-mount), `postgres` (postgres:18), `redis` (redis:7-alpine).
- `nixpacks.toml` (alt build, chromium via nixpkgs); `deploy/`: `remote-deploy.sh`, `backup.sh`, `restore.sh`, `RESTORE.md`, `proxy/` (Caddy), `monitor/`, `local/` (`clone-prod-db.sh`, local compose), `compose.env.example`. Scripts not read; behaviour unverified.
- Docs cited in code comments (`docs/decisions/`, `docs/domains/`, `docs/architecture.md`) do not exist in this checkout; only `docs/CODEMAPS/`.
