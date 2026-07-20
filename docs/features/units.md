# Feature: Units (Đơn vị tính / ĐVT)

## Goal

One shared catalogue of units of measure, used by every entity that needs one (products, materials, and later semi-finished goods). A unit knows *which kinds of entity may use it*, so each screen's ĐVT dropdown shows only sensible choices — `Tấm` never appears on a product form — while `Kg` stays a single row that all of them point at.

## Business rules

- **One shared table, not one per entity.** `Kg` is a single `units` row referenced by products and materials alike. This is deliberate: a future BOM/inventory module has to be able to tell that a material measured in `Kg` and a product measured in `Kg` use the same unit. Per-entity unit tables would make them different ids and throw that away.
- **Scope is data, not columns.** `unit_scopes` holds one row per `(unit, scope)`; `scope` is the `unit_scope` enum — `PRODUCT`, `MATERIAL`, `SEMI_FINISHED`. Adding a fourth consumer is one enum value plus data rows, with no change to the `units` table and no new column in any query.
- **A unit may carry several scopes.** `Cái` is valid for all three; `Tấm` is `MATERIAL` only.
- **`code` is unique** across the whole catalogue and is not scoped — there is exactly one `KG`.
- **Enforced on write, not just in the dropdown.** Filtering `GET /units?scope=` is presentation only; the create/update paths on products and materials re-check that the unit carries the matching scope and reject it with `E043` otherwise. Assigning `Mét` to a product through a hand-written request fails.
- **Deleting a unit is blocked while in use** — `products.unitId` / `materials.unitId` are `notNull` + `onDelete: restrict`. Scope rows cascade with their unit.
- **No unit conversion yet.** There is no base unit and no conversion factor: the system cannot express "1 Tấn = 1000 Kg" or turn `Mét` of bar stock into `Kg`. Nothing needs it today (no BOM, inventory, or purchasing module). `materials.specificWeight` is descriptive only and is not wired to any calculation. When conversion arrives it slots onto `units` without disturbing the scope model.

## API contract

| Method | Path | Auth | Request | Response |
| ------ | ---- | ---- | ------- | -------- |
| GET | `/units` | public | `GetUnitsReqDto` — `q` (code/name), `scope` | `200` + `UnitResDto[]` |

- **Deliberately not paginated.** This is a small, seeded, read-only catalogue whose only consumer is a dropdown, so the route returns a bare array — no `{ data, pagination }` envelope, no `page`/`limit`. Wrapping it cost a second `SELECT count(*)` per call and made the default `limit = 10` a silent trap: the 11th seeded unit would just stop appearing in the dropdown. Don't "restore consistency" with the paginated list endpoints — the asymmetry is the point. `GET /roles/permissions` is the same shape for the same reason.
- Results are ordered **alphabetically by `name`**, since the array is rendered as-is.
- `scope` accepts `PRODUCT` / `MATERIAL` / `SEMI_FINISHED`. **Omit it and every unit comes back** — always pass it when populating a form's ĐVT dropdown.
- `UnitResDto` is `{ id, code, name }`. The scope rows are not exposed: the client filters by query param and has no reason to see them.
- `q` fuzzy-matches (`unaccent` ILIKE) `code` and `name`.
- No CRUD — units are seeded (`pnpm db:seed:units`). An admin screen is a future task. If one ever ships, it needs its own paginated route rather than re-wrapping this one.

## Error cases

| Case | ErrorCode | HTTP status |
| ---- | --------- | ----------- |
| `unitId` references no unit | `ErrorCode.E011` | 404 |
| The unit exists but has no matching scope (e.g. `Mét` on a product) | `ErrorCode.E043` | 400 |

The two are deliberately distinct: a client needs to say "đơn vị không tồn tại" and "đơn vị này không dùng được cho sản phẩm" differently.

## Seeded data

`pnpm db:seed:units` — idempotent by `code`, and it **skips units that already exist**, so re-running never adds or removes scopes on a unit already in the DB. Changing a unit's scopes afterwards is a migration, not a re-seed.

| code | name | scopes |
| ---- | ---- | ------ |
| `TAM` | Tấm | MATERIAL |
| `CAY` | Cây | MATERIAL |
| `MET` | Mét | MATERIAL |
| `CAI` | Cái | PRODUCT, MATERIAL, SEMI_FINISHED |
| `BO` | Bộ | PRODUCT, MATERIAL, SEMI_FINISHED |
| `KG` | Kg | PRODUCT, MATERIAL, SEMI_FINISHED |

The catalogue is thin on the product side and has no `Thùng`, `Hộp`, `Lít`, `Tấn`, `m²` or `Cuộn` yet — extend `UNITS` in the seed when the business list is settled.

## Adding a new scope

1. Add the value to `UnitScope` + `unitScopeEnum` in `src/database/schemas/units.ts`.
2. `pnpm db:generate` → `ALTER TYPE "unit_scope" ADD VALUE ...`.
3. Insert the `unit_scopes` rows for the units that apply.
4. In the consuming service, check the new scope inside its `ensureUnitExists` helper.

No change to the `units` table, to `UnitResDto`, or to any other consumer.

## Out of scope

- **Unit conversion** (base unit + factor) — see the business rules above.
- **CRUD / admin screen** for units.
- Per-scope `code` (a unit code is globally unique on purpose).

## Frontend integration notes

- **Breaking change (2026-07-20)**: `GET /units` no longer paginates — it returns `UnitResDto[]` directly, with no `{ data, pagination }` wrapper. Read the array straight off the response and drop any `?page=` / `?limit=` (sending them is harmless, they're stripped by the validation pipe). `?q=` and `?scope=` are unchanged. The list is now ordered **alphabetically by name** instead of newest-first.
- **Breaking change (2026-07-20)**: `GET /units` gained a `scope` query param (`PRODUCT` | `MATERIAL` | `SEMI_FINISHED`). The route itself is backwards-compatible — omitting `scope` still returns every unit — but **every ĐVT dropdown must now pass it**, because the create/update endpoints reject an out-of-scope unit with **400 `E043`**. Use `?scope=PRODUCT` on product forms and `?scope=MATERIAL` on material forms.
- `E043` (`unit.error.scope_mismatch`) is new. Render it on the ĐVT field as "đơn vị không dùng được cho loại này", distinct from `E011` ("không tìm thấy đơn vị").
- `UnitResDto` is unchanged (`{ id, code, name }`) — the scope rows are server-side only.
