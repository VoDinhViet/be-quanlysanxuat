import { BomItemType } from '../../../database/schemas';

/** Shape of one `bom_items` row as `BomsService.getBomTree`'s SQL query already returns it — item
 * normalization (product vs. material) happens in SQL via `coalesce()`, not in TS. */
export type BomTreeRow = {
  id: string;
  parentId: string | null;
  itemType: BomItemType;
  itemId: string;
  code: string;
  name: string;
  unit: { id: string; code: string; name: string };
  quantity: string;
  sortOrder: number;
  note: string | null;
};

/** A `BomTreeRow` nested into a tree — what `BomsService.buildTree` produces. */
export type BomTreeNode = BomTreeRow & {
  level: number;
  children: BomTreeNode[];
};
