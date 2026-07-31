# Transaction Rules

Not `@import`ed by `CLAUDE.md` — read this when a service actually needs a transaction. Pointer +
trigger: `.claude/rules/api-module.md`, Services section.

Reference implementation: `MaterialsService.createMaterial` (`src/api/materials/materials.service.ts`)
is the simplest example. 7 services use `db.transaction` in this repo — `boms`, `inventory`
(`stock-receipts.service.ts`), `materials`, `orders`, `production-orders`, `products`, `suppliers` —
`OrdersService` has the fullest example if you need one closer to a complex multi-child-table write.

- **When you need one**: two or more write statements that must all land or all roll back (parent row + child rows, replace-all on a child table, a write plus its audit-log row). A single write needs no transaction — Postgres already makes it atomic.
- **Shape**: run every read-only check _first_ (`ensureXExists`, `validateXUniqueness`, `FilesService.linkFiles`), then wrap only the writes. Return the id from the callback and re-fetch the detail **after** the transaction commits — don't build a response DTO inside it.

  ```ts
  const { attachmentFileIds, ...materialFields } = reqDto;

  const materialId = await this.db.transaction(async (tx) => {
    const [material] = await tx
      .insert(materials)
      .values({ ...materialFields, code, createdBy: userId })
      .returning();
    if (attachmentFileIds?.length) {
      await this.createAttachments(tx, material.id, attachmentFileIds);
    }
    return material.id;
  });

  return this.getMaterialDetail(materialId);
  ```

- **Inside the callback use `tx` for every statement — never `this.db`.** `this.db` checks out a _different_ connection from the pool, so those statements run outside the transaction and commit on their own. There is no error and no warning when this happens; it is the easiest way to silently lose atomicity.
- **A write helper called from a transaction takes `tx: DbTransaction` as its first, required parameter** (`DbTransaction` from `src/database/database.type.ts`) — not a `Database | DbTransaction` union and never a `= this.db` default. `Database` is not assignable to `DbTransaction`, so this turns the mistake above into a compile error instead of a convention to remember.
- **Abort with `throw new AppException(...)`, not `tx.rollback()`.** Any throw inside the callback rolls the transaction back, and `AppException` keeps the right error code and HTTP status through `GlobalExceptionFilter`. `tx.rollback()` throws drizzle's `TransactionRollbackError`, which propagates out of `db.transaction()` untouched and surfaces to the client as a bare **500**.
- **A transaction gives atomicity, not isolation from concurrent writers.** Uniqueness checks run before it opens, so a TOCTOU window remains (see `generateMaterialCode()`, which counts rows and adds 1). The only real defence is a DB unique constraint.
- **Don't reach for these until a feature actually needs them**: nested `tx.transaction()` (real `SAVEPOINT`s) and the config argument (`isolationLevel` / `accessMode` / `deferrable`, emitted as `SET TRANSACTION ...`). The default `read committed` is fine; if you change it, write down why.
