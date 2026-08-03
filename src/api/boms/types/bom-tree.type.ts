import {
  BomItemType,
  files,
  operations,
  routingSteps,
} from '../../../database/schemas';

type FileRow = typeof files.$inferSelect;

/** Shape of one `bom_items` row as `BomsService.getBomTree`'s SQL query already returns it —
 * item normalization (product vs. material) happens in SQL via `coalesce()` at the join key, so
 * Drizzle collapses an unmatched `image`/`drawing`/`unit` left join straight to `null` — no
 * TS-side normalize step needed. */
export type BomTreeRow = {
  id: string;
  parentId: string | null;
  itemType: BomItemType;
  itemId: string;
  code: string;
  name: string;
  image: FileRow | null;
  unit: { id: string; code: string; name: string };
  quantity: number;
  sortOrder: number;
  level: number;
  note: string | null;
  drawing: FileRow | null;
};

/** Shape of one `routing_steps` row as `BomsService`'s batched as-used routing query returns it
 * (joined with its `operation`) — embedded raw onto each node's `operations` before the final
 * `plainToInstance(BomItemResDto, ...)` transform maps it into `RoutingStepResDto[]`, the same way
 * `children` stays raw until that same transform. */
export type BomTreeOperationRow = typeof routingSteps.$inferSelect & {
  operation: typeof operations.$inferSelect;
};

/** A `BomTreeRow` nested into a tree — what `BomsService.buildTree` produces. */
export type BomTreeNode = BomTreeRow & {
  children: BomTreeNode[];
  operations: BomTreeOperationRow[];
};
