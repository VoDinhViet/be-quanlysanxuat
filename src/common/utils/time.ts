import { tz } from '@date-fns/tz';
import { addDays, format, startOfDay } from 'date-fns';
import { sql } from 'drizzle-orm';
import type { SQL, SQLWrapper } from 'drizzle-orm';

// DB lưu giờ UTC, nghiệp vụ tính theo giờ VN: mọi format và mốc ngày ghim múi giờ này thay vì
// giờ local của server, để container chạy múi giờ nào kết quả cũng như nhau.
export const vnZone = tz('Asia/Ho_Chi_Minh');

// Giờ VN thay vì giờ máy chủ: container chạy UTC sẽ đặt tên file lệch 7 giờ.
export function getFileTimestamp(): string {
  return format(new Date(), 'yyyyMMdd-HHmm', { in: vnZone });
}

export function getFileDate(): string {
  return format(new Date(), 'yyyyMMdd', { in: vnZone });
}

/** Ngày lịch theo giờ Việt Nam của một mốc giờ, neo về UTC-midnight của đúng ngày đó — an toàn để
 * ghi vào cột Drizzle `date` (Postgres `date`, serialize qua `.toISOString()`). Ghi thẳng mốc giờ
 * vào cột `date` lệch một ngày trong khung 00:00–06:59 giờ VN, vì lúc đó vẫn còn là ngày hôm
 * trước theo UTC. */
export function vnDateOf(moment: Date): Date {
  const vnMoment = vnZone(moment);

  return new Date(
    Date.UTC(vnMoment.getFullYear(), vnMoment.getMonth(), vnMoment.getDate()),
  );
}

/** "Hôm nay" theo giờ Việt Nam, neo về UTC-midnight cho cột `date` (xem `vnDateOf`). */
export function vnToday(): Date {
  return vnDateOf(new Date());
}

// Bộ lọc khoảng ngày nhận `yyyy-MM-dd` đã parse thành 00:00 UTC (= 07:00 giờ VN, cùng ngày lịch).
// Cột `timestamp` lưu UTC nên ngày VN bắt đầu lúc 17:00 UTC hôm trước. Chỉ dùng cho cột
// `timestamp`; cột `date` so thẳng với giá trị đã parse.
export function startOfVnDay(date: Date): Date {
  return new Date(startOfDay(date, { in: vnZone }));
}

/** Cận trên loại trừ cho cột `timestamp`: đầu ngày VN kế tiếp. Dùng `lt` với giá trị này, không
 * dùng `lte(col, endDate)` (sẽ loại sai bản ghi xảy ra sau nửa đêm của ngày cuối). */
export function exclusiveEndOfDay(endDate: Date): Date {
  return new Date(startOfDay(addDays(endDate, 1, { in: vnZone })));
}

/** Giờ VN (`timestamp` không múi giờ) của một cột `timestamp` đang lưu UTC. Bọc cột bằng hàm này
 * trước khi `::date`, `date_trunc` hay so sánh với một ngày VN — không thì ngày bị tính theo UTC. */
export function vnTimestamp(column: SQLWrapper): SQL {
  return sql`((${column} at time zone 'UTC') at time zone 'Asia/Ho_Chi_Minh')`;
}

/** Giờ VN hiện tại (`timestamp` không múi giờ), cùng kiểu với `vnTimestamp(...)` và `date::timestamp`. */
export const VN_NOW = sql`(now() at time zone 'Asia/Ho_Chi_Minh')`;
