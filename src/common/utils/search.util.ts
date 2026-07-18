import { type AnyColumn, sql, type SQL } from 'drizzle-orm';

/**
 * Accent-insensitive, case-insensitive substring match, e.g. "khung may" matches "Khung máy A".
 * Requires the PostgreSQL `unaccent` extension (enabled once via migration).
 *
 * `keyword` is expected to already carry the `%...%` wildcards (same convention as
 * building a plain `ilike` keyword elsewhere in the codebase).
 */
export function unaccentILike(column: AnyColumn, keyword: string): SQL {
  return sql`unaccent(${column}) ILIKE unaccent(${keyword})`;
}
