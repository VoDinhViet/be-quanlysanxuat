import { relations } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import {
  InventoryDocumentStatus,
  inventoryDocumentStatusEnum,
} from './inventory-documents';
import { outsourcingReceiptItems } from './outsourcing-receipt-items';
import { warehouses } from './warehouses';
import { suppliers } from '../suppliers/suppliers';
import { users } from '../identity-access/users';

/**
 * Phiếu nhận gia công ngoài (OS-IN) — header, nhiều dòng ở `outsourcing_receipt_items`, mỗi dòng trỏ
 * đúng 1 dòng OS-OUT nguồn, cho gộp dòng từ nhiều OS-OUT khác nhau miễn cùng NCC — `supplierId` ở
 * đây là chốt bất biến đó, service-enforced (`E186`). `requiresIqc` tự sinh N `iqc_inspections` lúc
 * tạo, không gate `create`. Xem `docs/domains/inventory.md`, `docs/workflows/outsourcing-round-trip.md`.
 */
export const outsourcingReceipts = pgTable(
  'outsourcing_receipts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: varchar('code', { length: 50 }).notNull().unique(),
    warehouseId: uuid('warehouse_id')
      .notNull()
      .references(() => warehouses.id, { onDelete: 'restrict' }),
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => suppliers.id, { onDelete: 'restrict' }),
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
    index('idx_outsourcing_receipts_warehouse_id').on(table.warehouseId),
    index('idx_outsourcing_receipts_supplier_id').on(table.supplierId),
    index('idx_outsourcing_receipts_status').on(table.status),
    index('idx_outsourcing_receipts_receipt_date').on(table.receiptDate),
    index('idx_outsourcing_receipts_created_by').on(table.createdBy),
  ],
);

export const outsourcingReceiptsRelations = relations(
  outsourcingReceipts,
  ({ one, many }) => ({
    warehouse: one(warehouses, {
      fields: [outsourcingReceipts.warehouseId],
      references: [warehouses.id],
    }),
    supplier: one(suppliers, {
      fields: [outsourcingReceipts.supplierId],
      references: [suppliers.id],
    }),
    creatorBy: one(users, {
      fields: [outsourcingReceipts.createdBy],
      references: [users.id],
    }),
    posterBy: one(users, {
      fields: [outsourcingReceipts.postedBy],
      references: [users.id],
    }),
    items: many(outsourcingReceiptItems),
  }),
);

export type OutsourcingReceiptSelect = typeof outsourcingReceipts.$inferSelect;
