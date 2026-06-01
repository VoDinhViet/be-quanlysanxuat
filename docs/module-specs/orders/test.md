# Orders Test Plan

## Backend Test Cases

- Create order calculates totals correctly for VAT `0`, `5`, `8`, and `10`.
- Create order snapshots product code, name, unit price, quantity, and line total.
- Unknown client or product is rejected.
- Update/delete are allowed before approval and rejected for approved orders.
- Updating a rejected order resets it to `pending_approval`.
- Approve/reject only works for `pending_approval`.
- Production-safe response omits financial fields and PO PDF metadata.
- Order PDF accepts only PDF and respects max size.
- Product technical files list/upload/delete without overwriting thumbnails.

## Verification Commands

Run narrow tests after order or product-file behavior changes:

```bash
pnpm test -- orders.controller.spec.ts orders.service.spec.ts products.controller.spec.ts products.service.spec.ts
```

Run build because this module adds dependencies, migrations, permissions, and module wiring:

```bash
pnpm run build
```

Run code graph sync after code changes:

```bash
codegraph sync
```
