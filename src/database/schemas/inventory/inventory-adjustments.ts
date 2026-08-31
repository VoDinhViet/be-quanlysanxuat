import { relations } from 'drizzle-orm';
import {
  date,
  index,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import {
  InventoryDocumentStatus,
  inventoryDocumentStatusEnum,
} from './inventory-documents';
import { inventoryAdjustmentItems } from './inventory-adjustment-items';
import { users } from '../identity-access/users';

export enum InventoryAdjustmentType {
  INCREASE = 'INCREASE',
  DECREASE = 'DECREASE',
}

export const inventoryAdjustmentTypeEnum = pgEnum('inventory_adjustment_type', [
  InventoryAdjustmentType.INCREASE,
  InventoryAdjustmentType.DECREASE,
]);

export enum InventoryAdjustmentReason {
  STOCKTAKE = 'STOCKTAKE',
  DAMAGED = 'DAMAGED',
  LOST = 'LOST',
  OTHER = 'OTHER',
}

export const inventoryAdjustmentReasonEnum = pgEnum(
  'inventory_adjustment_reason',
  [
    InventoryAdjustmentReason.STOCKTAKE,
    InventoryAdjustmentReason.DAMAGED,
    InventoryAdjustmentReason.LOST,
    InventoryAdjustmentReason.OTHER,
  ],
);

/**
 * Phiếu điều chỉnh tồn (kiểm kê/hao hụt) — header, dùng chung
 * `inventory_document_status` với `inventory_receipts`/`inventory_issues` nhưng chỉ nhận
 * `DRAFT`/`POSTED`/`CANCELLED` (không có bước `confirm`, cùng khuôn phiếu xuất). `adjustmentType`
 * ở header quyết định dấu bút toán cho mọi dòng — xem `docs/workflows/inventory-adjustment.md`.
 */
export const inventoryAdjustments = pgTable(
  'inventory_adjustments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: varchar('code', { length: 50 }).notNull().unique(),
    adjustmentType: inventoryAdjustmentTypeEnum('adjustment_type').notNull(),
    reason: inventoryAdjustmentReasonEnum('reason').notNull(),
    adjustmentDate: date('adjustment_date', { mode: 'date' }).notNull(),
    status: inventoryDocumentStatusEnum('status')
      .notNull()
      .default(InventoryDocumentStatus.DRAFT),
    note: varchar('note', { length: 1000 }),
    postedBy: uuid('posted_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    postedAt: timestamp('posted_at'),
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
    index('idx_inventory_adjustments_status').on(table.status),
    index('idx_inventory_adjustments_adjustment_type').on(table.adjustmentType),
    index('idx_inventory_adjustments_adjustment_date').on(table.adjustmentDate),
    index('idx_inventory_adjustments_created_by').on(table.createdBy),
    index('idx_inventory_adjustments_posted_by').on(table.postedBy),
  ],
);

export const inventoryAdjustmentsRelations = relations(
  inventoryAdjustments,
  ({ one, many }) => ({
    creatorBy: one(users, {
      fields: [inventoryAdjustments.createdBy],
      references: [users.id],
    }),
    posterBy: one(users, {
      fields: [inventoryAdjustments.postedBy],
      references: [users.id],
    }),
    items: many(inventoryAdjustmentItems),
  }),
);

export type InventoryAdjustmentSelect =
  typeof inventoryAdjustments.$inferSelect;
