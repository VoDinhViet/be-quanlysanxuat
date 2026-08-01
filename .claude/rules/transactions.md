# Transaction Rules

Not `@import`ed — read when a service needs a transaction. Pointer: `.claude/rules/service.md`, Writes.

No service in this template uses `db.transaction` today — every surviving write is single-table
(`UsersService.createUser` inserts `credentials` then `users`, but deliberately not inside a
transaction: the order alone — credential first — keeps a failed credential insert from leaving an
orphan user, without needing rollback). This rule is the contract to follow the first time a feature
needs one. The example below is illustrative, not a real file.

- MUST use a transaction when two or more writes must all land or all roll back (parent + child rows, replace-all on a child table, a write plus its log row). MUST NOT wrap a single write — Postgres already makes it atomic.
- MUST run read-only checks (`ensureXExists`, `validateXUniqueness`, `FilesService.linkFiles`) **before** opening the transaction.
- MUST return the id from the callback and re-fetch the detail **after** commit. MUST NOT build a response DTO inside the callback.
  ```ts
  // minh hoạ, không phải file có thật
  const entityId = await this.db.transaction(async (tx) => {
    const [entity] = await tx.insert(someTable).values({...}).returning();
    if (attachmentFileIds?.length) await this.createAttachments(tx, entity.id, attachmentFileIds);
    return entity.id;
  });
  return this.getEntityDetail(entityId);
  ```
- MUST use `tx` for every statement inside the callback. MUST NOT use `this.db` — it checks out a different pooled connection, so those statements commit on their own with no error and no warning. This is the easiest way to silently lose atomicity.
- A write helper called from a transaction MUST take `tx: DbTransaction` as its first, required parameter. MUST NOT type it as `Database | DbTransaction` and MUST NOT default it to `this.db` — `Database` isn't assignable to `DbTransaction`, which turns the mistake above into a compile error.
- MUST abort by throwing `new AppException(...)`. MUST NOT call `tx.rollback()` — it throws drizzle's `TransactionRollbackError`, which surfaces to the client as a bare 500.
- MUST NOT rely on a transaction for isolation from concurrent writers — uniqueness checks run before it opens, so a TOCTOU window remains. Only a DB unique constraint really prevents duplicates.
- MUST NOT use nested `tx.transaction()` (SAVEPOINTs) or the config argument (`isolationLevel`/`accessMode`/`deferrable`) until a feature actually needs it; if you change the isolation level, write down why.
