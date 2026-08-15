import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  numeric,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import {
  InventoryDocumentStatus,
  inventoryDocumentStatusEnum,
} from './inventory-documents';
import { outsourcingOrders } from './outsourcing-orders';
import { warehouses } from './warehouses';
import { items } from '../items/items';
import { suppliers } from '../suppliers/suppliers';
import { users } from '../identity-access/users';

/**
 * Phiếu nhận gia công ngoài (OS-IN) — bảng phẳng, luôn trỏ đúng 1 `outsourcingOrderId` (một OS-OUT
 * nhận được nhiều lần, partial). `supplierId`/`itemId` denormalize từ OS-OUT — cần cho
 * `iqc_inspections.supplierId` (NOT NULL) và lọc list không phải join. `requiresIqc` tuỳ chọn tự
 * sinh 1 dòng `iqc_inspections` lúc `post`, không gate `post` (khác phiếu nhập mua). Xem
 * `docs/domains/inventory.md`, `docs/workflows/outsourcing-round-trip.md`.
 */
export const outsourcingReceipts = pgTable(
  'outsourcing_receipts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: varchar('code', { length: 50 }).notNull().unique(),
    outsourcingOrderId: uuid('outsourcing_order_id')
      .notNull()
      .references(() => outsourcingOrders.id, { onDelete: 'restrict' }),
    warehouseId: uuid('warehouse_id')
      .notNull()
      .references(() => warehouses.id, { onDelete: 'restrict' }),
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => suppliers.id, { onDelete: 'restrict' }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'restrict' }),
    quantity: numeric('quantity', {
      precision: 18,
      scale: 3,
      mode: 'number',
    }).notNull(),
    receiptDate: date('receipt_date', { mode: 'date' }).notNull(),
    requiresIqc: boolean('requires_iqc').notNull().default(false),
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
    index('idx_outsourcing_receipts_outsourcing_order_id').on(
      table.outsourcingOrderId,
    ),
    index('idx_outsourcing_receipts_warehouse_id').on(table.warehouseId),
    index('idx_outsourcing_receipts_supplier_id').on(table.supplierId),
    index('idx_outsourcing_receipts_item_id').on(table.itemId),
    index('idx_outsourcing_receipts_status').on(table.status),
    index('idx_outsourcing_receipts_receipt_date').on(table.receiptDate),
    index('idx_outsourcing_receipts_created_by').on(table.createdBy),
    check('chk_outsourcing_receipts_quantity_positive', sql`quantity > 0`),
  ],
);

export const outsourcingReceiptsRelations = relations(
  outsourcingReceipts,
  ({ one }) => ({
    outsourcingOrder: one(outsourcingOrders, {
      fields: [outsourcingReceipts.outsourcingOrderId],
      references: [outsourcingOrders.id],
    }),
    warehouse: one(warehouses, {
      fields: [outsourcingReceipts.warehouseId],
      references: [warehouses.id],
    }),
    supplier: one(suppliers, {
      fields: [outsourcingReceipts.supplierId],
      references: [suppliers.id],
    }),
    item: one(items, {
      fields: [outsourcingReceipts.itemId],
      references: [items.id],
    }),
    creatorBy: one(users, {
      fields: [outsourcingReceipts.createdBy],
      references: [users.id],
    }),
    posterBy: one(users, {
      fields: [outsourcingReceipts.postedBy],
      references: [users.id],
    }),
  }),
);

export type OutsourcingReceiptSelect = typeof outsourcingReceipts.$inferSelect;
