/** Drizzle bỏ qua field `undefined`, nên body chỉ toàn `undefined` vẫn nổ "No values to set" dù
 * `Object.keys` thấy có key — đếm giá trị thật, đừng đếm key. Gọi trước mọi `.set(...)` có thể
 * nhận object rỗng. */
export function hasFields(fields: object): boolean {
  return Object.values(fields).some((value) => value !== undefined);
}
