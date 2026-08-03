import { relations, sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { bomItems } from './bom-items';
import { operations } from '../operations';
import { products } from './products';
import { users } from '../identity-access/users';

/**
 * Routing: the sequence of công đoạn (operations) a node of a product's structure goes through,
 * e.g. Cắt laser → Chấn → Hàn → Sơn tĩnh điện.
 *
 * Rules:
 * - A row is either the routing of a **Cấp 0 root product** (`productId` set, `bomItemId` null)
 *   — the FG/WIP row itself, shown as the "STT 0" line of the structure grid — or of a
 *   **specific BOM node** (`bomItemId` set, `productId` null): as-used, since the same WIP
 *   product referenced from two different parents/positions in a BOM tree can carry a different
 *   routing at each position, because the step is tied to *where* it's used, not just *which*
 *   product it is.
 * - Only `itemType = PRODUCT` nodes are routable — `MATERIAL` (vật tư) leaf nodes never have a
 *   routing.
 * - Exactly one of `productId`/`bomItemId` is set per row, enforced by `chk_routing_steps_target`.
 * - No uniqueness on `(target, operationId)`: a real routing can revisit the same operation more
 *   than once (e.g. Kiểm tra → Gia công → Kiểm tra).
 */
export const routingSteps = pgTable(
  'routing_steps',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    // Cấp 0 (root product) routing target — mutually exclusive with bomItemId, see the CHECK below.
    productId: uuid('product_id').references(() => products.id, {
      onDelete: 'cascade',
    }),
    // As-used (per BOM node) routing target — mutually exclusive with productId.
    bomItemId: uuid('bom_item_id').references(() => bomItems.id, {
      onDelete: 'cascade',
    }),
    // restrict: an operation referenced by a routing step can't be hard-deleted out from under
    // it — same reasoning as `bom_items.productId`/`materialId`. `operations` itself is
    // soft-deleted, so it can still be retired without breaking this reference.
    operationId: uuid('operation_id')
      .notNull()
      .references(() => operations.id, { onDelete: 'restrict' }),
    // STT chạy — deterministic step ordering, tiebreak by createdAt, mirroring
    // `bom_items.sortOrder`.
    sortOrder: integer('sort_order').notNull().default(0),
    note: varchar('note', { length: 1000 }),
    createdBy: uuid('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('idx_routing_steps_product_id').on(table.productId),
    index('idx_routing_steps_bom_item_id').on(table.bomItemId),
    index('idx_routing_steps_operation_id').on(table.operationId),
    index('idx_routing_steps_created_by').on(table.createdBy),
    check(
      'chk_routing_steps_target',
      sql`(product_id IS NOT NULL AND bom_item_id IS NULL) OR (product_id IS NULL AND bom_item_id IS NOT NULL)`,
    ),
  ],
);

export const routingStepsRelations = relations(routingSteps, ({ one }) => ({
  product: one(products, {
    fields: [routingSteps.productId],
    references: [products.id],
  }),
  bomItem: one(bomItems, {
    fields: [routingSteps.bomItemId],
    references: [bomItems.id],
  }),
  operation: one(operations, {
    fields: [routingSteps.operationId],
    references: [operations.id],
  }),
  creator: one(users, {
    fields: [routingSteps.createdBy],
    references: [users.id],
  }),
}));
