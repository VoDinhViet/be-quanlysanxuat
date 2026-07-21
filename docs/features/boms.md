# Feature: BOMs (Bill of Materials / Cấu trúc sản phẩm)

## Goal

Read-only endpoint that returns a product revision's BOM as a nested tree ("Cấu trúc sản phẩm"): which products (WIP, "Cụm"/"Chi tiết") and materials (RM, "Vật tư") go into it, at what quantity, and how they nest. This is the read side only — there is no way yet to create or edit a BOM through the API (see Out of scope).

## Business rules

- A BOM belongs to exactly one `product_revisions` row (`revisionId` is unique on `boms`) — one BOM per revision, not per product. Different revisions of the same product can have entirely different structures.
- The FG root itself ("Cấp 0") is not a row in the tree — `bom_items` with `parentId = null` are the root's direct children ("Cấp 1"). `level` on the response is 1-based from there, computed per request (not stored).
- Each `bom_items` row links to exactly one of a `product` (WIP — a sub-assembly/part, itself built from its own revision's BOM) or a `material` (RM — a leaf, has no children) via `itemType` + `productId`/`materialId`. `code`/`name`/`unit` on the response are flattened from whichever side is linked.
- Sibling order is deterministic: `sortOrder` first, then `createdAt` as a tiebreaker — this is also the tree's presentational "STT" (e.g. "1.0.3") ordering.
- A product revision with no BOM configured yet returns an empty array — this is a normal state, not an error.

## API contract

| Method | Path | Auth | Request | Response |
| ------ | ---- | ---- | ------- | -------- |
| GET | `/products/:productId/revisions/:revisionId/bom` | public | — | `BomItemResDto[]` — top-level items ("Cấp 1"), each nesting its own `children` |

- `BomItemResDto`: `{ id, parentId, itemType (PRODUCT|MATERIAL), itemId, code, name, unit: { id, code, name }, quantity, sortOrder, level, note, children: BomItemResDto[] }`. `quantity` is serialized as a numeric string (Postgres `numeric`), not a JS `number`.
- Not paginated — a BOM tree is returned whole, same reasoning as `GET /products/:productId/revisions`.
- `unit` is derived from the linked product's/material's own `unitId` — there is no per-item unit override and no unit-conversion concept in the system yet (see `docs/features/units.md`).

## Error cases

| Case | ErrorCode | HTTP status |
| ---- | --------- | ----------- |
| Product not found (`:productId` doesn't reference an existing, non-deleted product) | `ErrorCode.E007` | 404 Not Found |
| Revision not found (`:revisionId` doesn't exist, or belongs to a different product) | `ErrorCode.E048` | 404 Not Found |

## Out of scope

- No write endpoints — creating/editing/deleting a BOM or its items isn't built yet. `BomsService` only reads; the schema comment on `bom_items.itemType`/`productId`/`materialId` already documents the exactly-one-of constraint that a future writer will need to enforce.
- No routing (`operations` per BOM item) — `operations` (`docs/features/operations.md`) exists as master data only; nothing links a `bom_items` row to an `operations` row yet.
- No permission enforcement beyond the global guard — `@Permissions('products:read')` is metadata only (per `.claude/rules/api-module.md`); the route is `@ApiPublic()`.
- No cycle detection — since there is no writer yet, a self-referencing or circular `parentId`/product-in-its-own-subtree chain cannot currently be created; a future writer will need to guard against it.

## Frontend integration notes

- **New feature (2026-07-21)**: `GET /products/:productId/revisions/:revisionId/bom` is a brand-new, public, unpaginated endpoint. Render "Cấu trúc sản phẩm" (tab on the product revision screen) directly from the returned tree — each node already carries its own `children`, no client-side nesting needed. An empty array means no BOM has been configured for that revision yet (show an empty state, not an error).
