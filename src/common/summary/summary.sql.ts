import { HttpStatus } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { AnyColumn, SQL, SQLWrapper } from 'drizzle-orm';

import { ErrorCode } from '../../constants/error-code.constant';
import { AppException } from '../../exceptions/app.exception';
import type { DateRangeReqDto } from './summary.dto';

// "Hôm nay" theo giờ Việt Nam (máy chủ DB chạy UTC): một định nghĩa cho mọi truy vấn, tránh lệch ngày
export const TODAY = sql.raw("(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date");

/** Cột enum/date ép thành chuỗi để trả đúng `YYYY-MM-DD` hoặc mã enum thay vì `Date` theo múi giờ máy chủ. */
export const asText = (column: SQLWrapper) => sql<string>`${column}::text`;

export const asNumber = (column: SQLWrapper) => sql<number>`${column}::float8`;

/** Số ngày từ `column` (kiểu `date`) đến hôm nay; âm khi `column` còn ở tương lai. */
export const daysSince = (column: SQLWrapper) =>
  sql<number>`(${TODAY} - ${column})::int`;

export function whereClause(conditions: SQL[]): SQL {
  if (conditions.length === 0) {
    return sql``;
  }

  return sql`WHERE ${sql.join(conditions, sql` AND `)}`;
}

// Mẫu `YYYY-MM-DD` vẫn cho qua ngày không có thật (2026-02-30), Postgres báo lỗi 500 (cả năm 0000)
function assertCalendarDate(value: string, field: string): void {
  const date = new Date(`${value}T00:00:00Z`);
  if (
    value < '0001-01-01' ||
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new AppException(
      ErrorCode.V000,
      HttpStatus.UNPROCESSABLE_ENTITY,
      `${field} is not a real calendar date`,
    );
  }
}

/**
 * Khoảng ngày gồm cả ngày cuối (so với đầu ngày kế tiếp). `column` là cột cố định trong code,
 * không bao giờ lấy từ request.
 */
export function dateRangeConditions(
  column: SQL | AnyColumn,
  range: DateRangeReqDto,
): SQL[] {
  if (range.startDate) {
    assertCalendarDate(range.startDate, 'startDate');
  }
  if (range.endDate) {
    assertCalendarDate(range.endDate, 'endDate');
  }
  if (range.startDate && range.endDate && range.endDate < range.startDate) {
    throw new AppException(
      ErrorCode.V000,
      HttpStatus.UNPROCESSABLE_ENTITY,
      'endDate is before startDate',
    );
  }

  const conditions: SQL[] = [];
  if (range.startDate) {
    conditions.push(sql`${column} >= ${range.startDate}::date`);
  }
  if (range.endDate) {
    conditions.push(sql`${column} < ${range.endDate}::date + 1`);
  }

  return conditions;
}

/** Khoảng ngày kèm bộ lọc trạng thái tuỳ chọn (so khớp qua `equalsText`). */
export function dateRangeAndStatusConditions(
  dateColumn: SQL | AnyColumn,
  statusColumn: AnyColumn,
  reqDto: DateRangeReqDto & { status?: string },
): SQL[] {
  const conditions = dateRangeConditions(dateColumn, reqDto);
  if (!reqDto.status) {
    return conditions;
  }

  return [...conditions, equalsText(statusColumn, reqDto.status)];
}

/**
 * So khớp cột enum với chuỗi từ request qua `::text`: giá trị lạ cho kết quả rỗng thay vì lỗi
 * `invalid input value for enum`.
 */
export function equalsText(column: AnyColumn | SQL, value: string): SQL {
  return sql`${column}::text = ${value}`;
}

export function inTexts(column: AnyColumn | SQL, values: string[]): SQL {
  return sql`${column}::text IN (${sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  )})`;
}
