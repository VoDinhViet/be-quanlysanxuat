# Products Test Plan

## Test Scope

Follow `docs/standards/testing-standards.md`.

Controller tests should verify delegation, route DTO shape, and response ownership. Service tests should verify database query decisions, transactions, mapping, and business rules.

## Backend Test Cases

- List products with keyword/filter/pagination.
- List products sorted by `createdAt desc` only.
- Create product creates default revision.
- Reject duplicate product code.
- Reject duplicate revision number.
- Add BOM child success.
- Reject BOM cycle.
- Reject self-child BOM.
- Reject child under RM/Consumable parent.
- Update BOM quantity validates WIP integer and RM decimal rules.
- Get BOM tree returns nested structure.
- Save routing for FG/WIP success.
- Reject routing for RM/Consumable.
- Reject duplicate routing `stepNo`.
- Lock product prevents product/revision/BOM/routing updates.
- Unlock product restores active status.
- Copy product copies base info, revision, BOM, and routing.
- Delete product soft deletes when allowed.
- Upload image validates MIME type and file size.
- Delete image clears `imageUrl` and file metadata.

## Verification Commands

Run narrow tests after behavior changes:

```bash
pnpm test -- products.controller.spec.ts products.service.spec.ts
```

Run build only when dependency wiring or broad type risk changes:

```bash
pnpm run build
```

Run code graph sync after code changes:

```bash
codegraph sync
```

## Manual API Checks

- Create product with initial revision.
- Upload and delete product image.
- Lock product and verify update/BOM/routing mutations fail.
- Unlock product and verify mutations work again.
- Create revision by copying an existing revision.
- Add nested BOM nodes and verify tree shape.
- Save routing for FG/WIP and verify RM/Consumable has no routing action.
