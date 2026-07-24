import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from './schemas';

export type Database = PostgresJsDatabase<typeof schema>;

/**
 * The handle drizzle passes to a `db.transaction(async (tx) => ...)` callback. Same query surface
 * as `Database` (`insert`/`update`/`delete`/`select`/`query.*`), but every statement runs inside
 * the open transaction.
 *
 * Use it as the parameter type of any service write helper that must run inside a transaction.
 * `Database` is deliberately **not** assignable to it (drizzle's `PgTransaction` carries protected
 * members), so handing a helper the pooled connection by mistake is a compile error rather than a
 * silent escape onto a separate connection that commits on its own.
 */
export type DbTransaction = Parameters<
  Parameters<Database['transaction']>[0]
>[0];
