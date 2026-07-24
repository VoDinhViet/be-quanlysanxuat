/**
 * Formats a UUID into a safe PostgreSQL ltree label ([A-Za-z0-9_]) — ltree labels can't contain
 * hyphens, so a raw UUID needs escaping before it can be used as a `bom_items.path` segment.
 * Shared by `BomsService` (per-node writes) and `ProductsService` (BOM-tree clone on copy).
 */
export function formatLtreeNodeId(id: string): string {
  return 'n_' + id.replace(/-/g, '_');
}
