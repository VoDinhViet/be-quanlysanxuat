import {
  BomItemType,
  FileKind,
  operations,
  routingSteps,
  UploadType,
} from '../../../database/schemas';

/** Shape of one `bom_items` row as `BomsService.getBomTree`'s SQL query already returns it (AFTER
 * `BomsService.normalizeImage` collapses the all-null coalesced `image` sub-select to `null`) —
 * item normalization (product vs. material) happens in SQL via `coalesce()`, not in TS. */
export type BomTreeRow = {
  id: string;
  parentId: string | null;
  itemType: BomItemType;
  itemId: string;
  code: string;
  name: string;
  image: {
    id: string;
    originalName: string;
    mimetype: string;
    size: number;
    type: UploadType;
    kind: FileKind;
    createdAt: Date;
  } | null;
  unit: { id: string; code: string; name: string };
  quantity: number;
  sortOrder: number;
  note: string | null;
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
  level: number;
  children: BomTreeNode[];
  operations: BomTreeOperationRow[];
};
