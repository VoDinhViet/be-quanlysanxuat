# Feature: Product Groups (Nhóm sản phẩm)

## Goal

Read-only catalogue that classifies a product by its **nature and origin** — is it something the factory built, a component, a material, or something bought in. It populates the "Nhóm sản phẩm" dropdown and filter on the products screen, and is what `products.productGroupId` points at.

## Business rules

- **Classification is by nature, not by product family.** The groups answer "what kind of thing is this" (thành phẩm / linh kiện / vật tư / mua ngoài), not "which product line" (tủ điện / băng tải / …). A future need to group by product line is a different axis and would need its own field, not extra rows here.
- **`code` is unique** across the catalogue.
- `name` is required; `description` is optional free text.
- **Optional on products**: `products.productGroupId` is nullable — a product may have no group. A supplied id must exist (`E010`).
- **Read-only.** No create/update/delete route; the catalogue is seeded (`pnpm db:seed:product-groups`). An admin screen is a future task.
- **`VAT_TU` here is *not* the materials module.** This is a *product* group and lives in `product_groups`; the materials module has its own separate `material_groups` table (`THEP_TAM`, `ONG_INOX`, …). Same Vietnamese word, different table, different purpose — a product classified `VAT_TU` is still a row in `products`, not in `materials`.

## API contract

| Method | Path | Auth | Request | Response |
| ------ | ---- | ---- | ------- | -------- |
| GET | `/product-groups` | public | `GetProductGroupsReqDto` — paginated; `q` (code/name) | `200` + paginated `ProductGroupResDto` |

- `q` fuzzy-matches (`unaccent` ILIKE) `code` and `name`, so "vat tu" finds "Vật tư".
- `ProductGroupResDto` is `{ id, code, name, description, createdAt, updatedAt }`.
- **Stays paginated**, unlike `GET /units` which returns a bare array (see `docs/features/units.md`). Only `units` was un-paginated; this route kept its envelope.
- Public — no bearer token. Note `GET /material-groups` requires `materials:read`; that inconsistency is known and deliberately unresolved.

## Error cases

This route has no business error branches — it's an unfiltered list read. The related code is raised by the **products** module:

| Case | ErrorCode | HTTP status |
| ---- | --------- | ----------- |
| `productGroupId` on a product references no group | `ErrorCode.E010` | 404 |

## Seeded data

`pnpm db:seed:product-groups` — idempotent per row, keyed on `code`; re-running logs a skip and never duplicates or updates.

| code | name | description |
| ---- | ---- | ----------- |
| `THANH_PHAM` | Sản phẩm thành phẩm | Sản phẩm hoàn chỉnh do nhà máy sản xuất |
| `LINH_KIEN` | Linh kiện | Linh kiện, cụm chi tiết |
| `VAT_TU` | Vật tư | Vật tư dùng trong sản xuất |
| `MUA_NGOAI` | Mua ngoài | Hàng mua ngoài, không tự sản xuất |

Because the seed skips existing rows, changing a group's `name`/`description` later is an `UPDATE` or an admin screen — not a re-run.

## Out of scope

- **CRUD** — no `POST`/`PATCH`/`DELETE`, and no `product-groups:*` permission codes in the catalogue until those routes exist.
- **Nested/hierarchical groups** — the table is flat, with no parent id.
- **Per-group rules** — a group carries no behaviour; nothing branches on `code`. It is a label for filtering and reporting only.

## Frontend integration notes

- **New (2026-07-20)**: `GET /product-groups` finally returns data. The module and route existed since 2026-07-14, but the table had **no seed and 0 rows**, so the "Nhóm sản phẩm" dropdown was silently always empty. Run `pnpm db:seed:product-groups` on each environment; expect the 4 groups above.
- **Non-breaking (2026-07-20)**: `ProductGroupResDto` gained `description`, `createdAt`, `updatedAt`. Fields were only added — `id`, `code`, `name` are unchanged, so existing code keeps working.
- The route is still paginated (`{ data, pagination }`) — don't confuse it with `GET /units`, which dropped its envelope on the same day.
- `?q=` is accent-insensitive; the search box can send Vietnamese text with or without diacritics.
