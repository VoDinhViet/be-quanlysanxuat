/** `Map.groupBy` (ES2024) chưa dùng được — `tsconfig.json`'s `target: "ES2023"` không có type
 * cho nó. Thay cho lặp lại tay `new Map() + get(...) ?? [] + push + set` ở nhiều service
 * (boms/bom-tree.util.ts, iqc, purchase-orders, purchase-quotations, …). */
export function groupBy<T, K>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const group = map.get(key(item));
    if (group) {
      group.push(item);
    } else {
      map.set(key(item), [item]);
    }
  }
  return map;
}
