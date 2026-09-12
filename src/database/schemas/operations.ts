import { relations } from 'drizzle-orm';
import {
  index,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { users } from './identity-access/users';

/** Which lane a công đoạn (operation) runs in: `INHOUSE` is performed on the factory floor,
 * `OUTSOURCE` is sent to a supplier (gia công ngoài). The real, load-bearing value lives per
 * attachment on `routing_operations.type`/`bom_operations.type` (the same catalog operation can be
 * Inhouse on one routing and Outsource on another) — `operations.type` here is only the default
 * suggestion pre-filled when attaching, plus the value the "Gia công ngoài" catalog screen filters
 * on (`GET /operations?type=OUTSOURCE`). See `docs/decisions/routing-operation-type-per-attachment.md`. */
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
 * Referenced by `routing_operations` (Cấp 0, keyed by the root item) and `bom_operations` (keyed
 * by a specific WIP BOM node) to sequence the steps an item/node goes through. Soft-deleted, not
 * hard-deleted — both referencing tables use `onDelete: 'restrict'`, and since a restrict FK never
 * fires against a `deletedAt` update, `OperationsService.deleteOperation` checks both itself. */
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
  (table) => [
    index('idx_operations_created_by').on(table.createdBy),
    index('idx_operations_type').on(table.type),
    index('idx_operations_status').on(table.status),
  ],
);

export const operationsRelations = relations(operations, ({ one }) => ({
  creatorBy: one(users, {
    fields: [operations.createdBy],
    references: [users.id],
  }),
}));

export type OperationSelect = typeof operations.$inferSelect;
