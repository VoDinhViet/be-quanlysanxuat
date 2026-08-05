import { bomItems, bomOperations, operations } from '../../../database/schemas';

/** Shape of one `bom_items` row as `ProductionJobsService.copyBomProcess`'s source query returns it
 * (joined with `product`, narrowed to `code`/`name` only) — Drizzle's relational query type
 * inference struggles here (same class of issue as `RawBomItemRow` in `boms.service.ts`), so the
 * query result is cast to this at the call site. */
export type SourceBomItemRow = typeof bomItems.$inferSelect & {
  product: { code: string; name: string } | null;
};

/** Shape of one `bom_operations` row as `ProductionJobsService.copyBomProcess`'s as-used query
 * returns it (joined with `operation`, narrowed to `code`/`name`/`type`) — same class of type
 * inference issue as `SourceBomItemRow`. */
export type SourceBomOperationRow = typeof bomOperations.$inferSelect & {
  operation: Pick<typeof operations.$inferSelect, 'code' | 'name' | 'type'>;
};
