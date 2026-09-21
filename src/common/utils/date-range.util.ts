/** Exclusive next-day boundary — `endDate` parses to midnight UTC, `lt` on a `timestamp` column
 * needs the start of the *following* day, not `lte(col, endDate)` (would drop same-day rows). */
export function exclusiveEndOfDay(endDate: Date): Date {
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  return new Date(endDate.getTime() + ONE_DAY_MS);
}
