import { relations } from 'drizzle-orm';
import {
  index,
  integer,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { operations } from '../operations';
import { routings } from './routings';
import { users } from '../identity-access/users';

/**
 * Một bước trong routing Cấp 0 của một item. Cùng khuôn `bom_operations`.
 *
 * Rules:
 * - No uniqueness on `(routingId, operationId)`: a real routing can revisit the same operation
 *   more than once (e.g. Kiểm tra → Gia công → Kiểm tra).
 */
export const routingOperations = pgTable(
  'routing_operations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    routingId: uuid('routing_id')
      .notNull()
      .references(() => routings.id, { onDelete: 'cascade' }),
    // restrict: an operation referenced by a routing step can't be hard-deleted out from under it
    // — `operations` itself is soft-deleted, so it can still be retired without breaking this
    // reference.
    operationId: uuid('operation_id')
      .notNull()
      .references(() => operations.id, { onDelete: 'restrict' }),
    // STT chạy — deterministic step ordering, tiebreak by createdAt, mirroring
    // `bom_operations.sortOrder`.
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
    index('idx_routing_operations_routing_id').on(table.routingId),
    index('idx_routing_operations_operation_id').on(table.operationId),
    index('idx_routing_operations_created_by').on(table.createdBy),
  ],
);

export const routingOperationsRelations = relations(
  routingOperations,
  ({ one }) => ({
    routing: one(routings, {
      fields: [routingOperations.routingId],
      references: [routings.id],
    }),
    operation: one(operations, {
      fields: [routingOperations.operationId],
      references: [operations.id],
    }),
    creatorBy: one(users, {
      fields: [routingOperations.createdBy],
      references: [users.id],
    }),
  }),
);
