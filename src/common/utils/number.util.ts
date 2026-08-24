/** `.mapWith(Number)` biến SQL `null` thành `0` (`Number(null) === 0`) — sai cho % trend nghĩa là
 * "chưa có kỳ trước để so sánh". Dùng `.mapWith` này ở mọi biểu thức có thể thật sự trả `null`. */
export function mapNullableNumber(value: unknown): number | null {
  return value === null ? null : Number(value);
}
