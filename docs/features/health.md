# Feature: Health

## Goal

Give load balancers, orchestrators, and monitoring a single endpoint to check whether the app and its hard dependencies (PostgreSQL, Redis) are reachable.

## Business rules

- The check is a readiness check, not just a liveness ping: it actively verifies PostgreSQL (`SELECT 1` via the `DRIZZLE` connection) and Redis (a set/get round-trip through `CACHE_MANAGER`) on every call — nothing is cached between requests.
- Overall status is `"ok"` only if **both** dependencies report `up`; if either is `down`, the whole response status is `"error"` and the HTTP status becomes `503`.
- Redis is checked indirectly through the cache layer (write a fixed key, read it back, compare) — there is no raw `ioredis` client in this app to issue a real `PING`. A cache-manager failure of any kind (connection, timeout, mismatch) counts as Redis being down.

## API contract

| Method | Path | Auth | Request | Response |
| ------ | ---- | ---- | ------- | -------- |
| GET | `/health` | public | — | `200` (all up) or `503` (`@nestjs/terminus` `HealthCheckResult`: `{ status, info, error, details }` with a `database` and a `redis` key) |

- `GET health` is excluded from the global `api` prefix in `src/main.ts` (`app.setGlobalPrefix('api', { exclude: [...] })`, pre-existing config) — the real route is `GET /health`, **not** `GET /api/health`. This mirrors how the app already excludes the root `GET /` route, so infra probes hit a stable, unversioned path.
- Response shape comes from `@nestjs/terminus`, not a project DTO — this is an intentional exception to the usual `ResDto` + `@Expose` convention (see `.claude/rules/api-module.md`), since Terminus owns the response contract and the 503-on-failure behavior.

## Error cases

| Case | Response | HTTP status |
| ---- | -------- | ----------- |
| PostgreSQL unreachable / query fails | `details.database.status = "down"` | 503 |
| Redis unreachable / round-trip value mismatch | `details.redis.status = "down"` | 503 |

## Out of scope

- No latency/metrics reporting (response time, connection pool stats) — up/down only.
- No auth on this endpoint — it must stay publicly reachable for external probes.
- No per-dependency alerting/paging — that's an infra/ops concern outside this app.

## Frontend integration notes

- No breaking changes as of 2026-07-13. No frontend action needed for this feature.
