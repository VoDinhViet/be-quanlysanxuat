import { relations } from 'drizzle-orm';
import {
  index,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { users } from './users';

/** Which lane a công đoạn (operation) runs in: `INHOUSE` is performed on the factory floor,
 * `OUTSOURCE` is sent to a supplier (gia công ngoài) — the master flag the "Gia công ngoài"
 * screen filters on (`GET /operations?type=OUTSOURCE`). A routing step defaults to this value
 * but may override it per step. */
export enum OperationType {
  INHOUSE = 'INHOUSE',
  OUTSOURCE = 'OUTSOURCE',
}

export const operationTypeEnum = pgEnum('operation_type', [
  OperationType.INHOUSE,
  OperationType.OUTSOURCE,
]);

export enum OperationStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

export const operationStatusEnum = pgEnum('operation_status', [
  OperationStatus.ACTIVE,
  OperationStatus.INACTIVE,
]);

/** Master data for công đoạn (production operations/steps), e.g. Cắt laser, Hàn, Sơn tĩnh điện.
 * Referenced by routing (`routing_steps`, keyed by a root product OR a specific BOM node) to
 * sequence the steps a product/node goes through. Soft-deleted, not hard-deleted, because routing
 * holds a foreign key to a row here. */
export const operations = pgTable(
  'operations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: varchar('code', { length: 50 }).notNull().unique(),
    name: varchar('name', { length: 255 }).notNull(),
    type: operationTypeEnum('type').notNull().default(OperationType.INHOUSE),
    note: varchar('note', { length: 1000 }),
    status: operationStatusEnum('status')
      .notNull()
      .default(OperationStatus.ACTIVE),
    createdBy: uuid('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp('deleted_at'),
  },
  (table) => [index('idx_operations_created_by').on(table.createdBy)],
);

export const operationsRelations = relations(operations, ({ one }) => ({
  creator: one(users, {
    fields: [operations.createdBy],
    references: [users.id],
  }),
}));
