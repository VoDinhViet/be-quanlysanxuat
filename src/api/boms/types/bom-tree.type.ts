import {
  BomItemType,
  FileKind,
  operations,
  routingSteps,
  UploadType,
} from '../../../database/schemas';

/** A `files` row as embedded on a BOM tree node (`image`/`drawing`) — same shape either way, just
 * sourced from a different join. Shared here so both fields (and `RawBomItemRow` in
 * `boms.service.ts`, which needs every field individually nullable pre-normalize) derive from one
 * definition instead of three hand-copied field lists drifting apart. */
export type BomTreeFileRow = {
  id: string;
  originalName: string;
  mimetype: string;
  size: number;
  type: UploadType;
  kind: FileKind;
  createdAt: Date;
};

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
  image: BomTreeFileRow | null;
  unit: { id: string; code: string; name: string };
  quantity: number;
  sortOrder: number;
  note: string | null;
  // Straight left-join onto `bom_items.drawingFileId` (not a 2-source coalesce like `image`), so
  // drizzle already collapses this to `null` on no match — no raw pre-normalize shape needed.
  drawing: BomTreeFileRow | null;
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
