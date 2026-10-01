import { plainToInstance, ClassConstructor } from 'class-transformer';
import { DateTime } from 'luxon';

const VIETNAM_ZONE = 'Asia/Ho_Chi_Minh';

/** Most rows a list tool hands to the model; more would only burn context. */
export const MAX_LIST_ROWS = 20;
/** Cap on a serialized tool result, so one tool call cannot flood the model's context. */
const MAX_RESULT_CHARS = 6000;

export function clampLimit(limit: number | undefined, fallback = 10): number {
  return Math.min(Math.max(limit ?? fallback, 1), MAX_LIST_ROWS);
}

/** Builds a service request DTO from plain values so its defaults and getters (e.g. `offset`) exist. */
export function createRequestDto<T extends object>(
  dto: ClassConstructor<T>,
  values: Partial<Record<keyof T, unknown>>,
): T {
  return plainToInstance(dto, values);
}

/** A date-only value `daysFromToday` away from today in Vietnam, as UTC midnight so it is stored
 * and compared as the same calendar day by `date` columns. */
export function getVietnamDate(daysFromToday = 0): Date {
  const isoDate = DateTime.now()
    .setZone(VIETNAM_ZONE)
    .plus({ days: daysFromToday })
    .toISODate();
  return new Date(`${isoDate}T00:00:00.000Z`);
}

/** Parses a `yyyy-MM-dd` string the model supplied into the same UTC-midnight form. */
export function parseDateInput(isoDate: string | undefined): Date | undefined {
  return isoDate ? new Date(`${isoDate}T00:00:00.000Z`) : undefined;
}

export function formatVietnamDate(
  date: Date | null | undefined,
): string | null {
  if (!date) {
    return null;
  }
  // Vietnam time on purpose: a `date` column is stored as UTC midnight (still the same calendar
  // day at UTC+7), while a timestamp near midnight UTC is already the next day in Vietnam.
  return DateTime.fromJSDate(date, { zone: VIETNAM_ZONE }).toFormat(
    'dd/MM/yyyy',
  );
}

/** `JSON.stringify` replacer: every `Date` becomes `dd/MM/yyyy`, so no tool formats dates itself.
 * Reads `this[key]` because `toJSON` has already turned the value into an ISO string by now. */
function replaceDates(
  this: Record<string, unknown>,
  key: string,
  value: unknown,
) {
  const original = this[key];
  return original instanceof Date ? formatVietnamDate(original) : value;
}

export function formatToolResult(payload: object): string {
  return JSON.stringify(payload, replaceDates);
}

/** Keeps only the fields the output DTO exposes (`@Expose`), dropping everything else a service
 * DTO carries — this is the allowlist that keeps sensitive columns away from the model. */
export function serializeToolRows<T extends object>(
  dto: ClassConstructor<T>,
  rows: object[],
): T[] {
  return plainToInstance(dto, rows, { excludeExtraneousValues: true });
}

/** Serializes a list for the model: at most `MAX_LIST_ROWS` rows and `MAX_RESULT_CHARS` characters,
 * with `total` vs `showing` so the model can say the list is partial. */
export function formatListResult(params: {
  rows: object[];
  total: number;
  extra?: Record<string, unknown>;
}): string {
  const { rows, total, extra } = params;
  let shown = rows.slice(0, MAX_LIST_ROWS);

  const serialize = () =>
    formatToolResult({ ...extra, total, showing: shown.length, rows: shown });

  let result = serialize();
  while (result.length > MAX_RESULT_CHARS && shown.length > 1) {
    shown = shown.slice(0, -1);
    result = serialize();
  }
  return result;
}
