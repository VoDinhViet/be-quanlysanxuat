export type PlannedQuantityNode = {
  id: string;
  parentId: string | null;
  quantity: number;
};

/** SL kế hoạch của một node = SL kế hoạch node cha (gốc là SL Job) × định mức (`quantity`) của
 * chính node — nhân luỹ kế theo cây, vì `quantity` là định mức trên 1 đơn vị cha, không phải số
 * tuyệt đối. Không lưu cột: `quantity`/`parentId`/SL Job bất biến sau khi Job duyệt nên tính lại
 * lúc đọc không lệch. Pure function, không DI — dùng chung `production-jobs` +
 * `outsourcing-orders`, xem `docs/domains/production.md`. */
export function resolvePlannedQuantities(
  nodes: PlannedQuantityNode[],
  jobQuantity: number,
): Map<string, number> {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const planned = new Map<string, number>();

  const resolve = (id: string): number => {
    const cached = planned.get(id);
    if (cached !== undefined) {
      return cached;
    }
    const node = nodeById.get(id)!;
    const parentPlanned = node.parentId ? resolve(node.parentId) : jobQuantity;
    const value = parentPlanned * node.quantity;
    planned.set(id, value);
    return value;
  };

  for (const node of nodes) {
    resolve(node.id);
  }

  return planned;
}
