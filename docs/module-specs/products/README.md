# Products Module Docs

## Purpose

The products module owns production master data: products, revisions, BOM tree, and routing steps.

Source:

```text
src/api/products/
```

## Files

- [api.md](api.md): API contract, permissions, dependencies, database rules, and security rules.
- [plan.md](plan.md): implementation plan, sequencing, and change checklist.
- [test.md](test.md): backend test strategy, coverage list, and verification commands.
- [preview.md](preview.md): user-facing screens, buttons, dialogs, and manual preview checklist.

Related product/BOM/routing planning doc:

- [products-bom-routing-plan.md](../../products-bom-routing-plan.md)

## Current Status

Product CRUD, lock/unlock, copy, option, revision, BOM tree/line, and routing endpoints are implemented.

Implemented:

- Nest module/controller/service/spec scaffold.
- AppModule wiring.
- Product permission codes and RBAC seed entries.
- Product CRUD endpoints.
- Product lock/unlock endpoints.
- Product copy endpoint.
- Product/unit/type/operation option endpoints.
- Product revision list/create/update endpoints.
- Product image upload/delete endpoints backed by `/uploads/products`.
- BOM tree endpoint.
- BOM line create/update/delete endpoints.
- Routing get/replace endpoints.
- Product `clientId` schema link.
- Unique indexes for product code and product revision number per product.
- `bomLines.sortOrder` schema field for stable tree-grid ordering.
