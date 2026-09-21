import { groupBy } from '../../common/utils/array.util';

/** Vừa đủ field `buildBomItemPaths` cần đọc — không phải `BomItemResDto`/schema row đầy đủ,
 *  nên hàm test được độc lập mà không cần dựng cả shape đó. */
type BomItemRef = {
  id: string;
  parentId: string | null;
};

/** Gom các node theo `parentId` rồi đệ quy để tính path depth-first (mảng rank anh em từng cấp) —
 *  chuyển từ FE (`bom-rows.util.ts`) sang đây để FE không cần tự dựng lại cây nữa, response trả
 *  sẵn đúng thứ tự. `parentId: null` nghĩa là ngay dưới Cấp 0 (không phải một node thật) nên có
 *  thể có nhiều node cùng nhận `null` — chúng là anh em của nhau, path bắt đầu từ `[1]`. Yêu cầu
 *  `nodes` đã sắp theo (level, sortOrder, createdAt) như query hiện tại của
 *  `BomsService.getBomItem` — 2 node cùng cha luôn cùng level nên thứ tự tương đối giữa các anh em
 *  vẫn đúng dù mảng tổng chưa phải depth-first. */
export function buildBomItemPaths(nodes: BomItemRef[]): Map<string, number[]> {
  const childrenByParentId = groupBy(nodes, (node) => node.parentId);

  const paths = new Map<string, number[]>();

  function walk(parentId: string | null, parentPath: number[]): void {
    const children = childrenByParentId.get(parentId) ?? [];
    children.forEach((child, index) => {
      const path = [...parentPath, index + 1];
      paths.set(child.id, path);
      walk(child.id, path);
    });
  }
  walk(null, []);

  return paths;
}

/** So 2 path (mảng số) kiểu lexicographic — dùng để sort node theo đúng thứ tự depth-first sau
 *  khi đã có path từ `buildBomItemPaths`. */
export function compareBomPaths(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return a.length - b.length;
}
