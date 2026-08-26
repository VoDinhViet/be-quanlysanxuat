const VN_TIME_ZONE = 'Asia/Ho_Chi_Minh';

/** "Hôm nay" theo giờ Việt Nam, neo về UTC-midnight của đúng ngày đó — an toàn để ghi vào cột
 * Drizzle `date` (Postgres `date`, serialize qua `.toISOString()`). `new Date()` trần lệch một
 * ngày trong khung 00:00–06:59 giờ VN, vì lúc đó vẫn còn là ngày hôm trước theo UTC. */
export function vnToday(): Date {
  const [year, month, day] = new Intl.DateTimeFormat('en-CA', {
    timeZone: VN_TIME_ZONE,
  })
    .format(new Date())
    .split('-')
    .map(Number);

  return new Date(Date.UTC(year, month - 1, day));
}
