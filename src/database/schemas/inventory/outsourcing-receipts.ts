import { relations } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { outsourcingReceiptItems } from './outsourcing-receipt-items';
import { suppliers } from '../suppliers/suppliers';
import { users } from '../identity-access/users';

export enum OutsourcingReceiptStatus {
  POSTED = 'POSTED',
  CANCELLED = 'CANCELLED',
}

export const outsourcingReceiptStatusEnum = pgEnum(
  'outsourcing_receipt_status',
  [OutsourcingReceiptStatus.POSTED, OutsourcingReceiptStatus.CANCELLED],
);

/**
 * Phiếu nhận gia công ngoài (OS-IN) — header, nhiều dòng ở `outsourcing_receipt_items`, mỗi dòng trỏ
 * đúng 1 dòng OS-OUT nguồn, cho gộp dòng từ nhiều OS-OUT khác nhau miễn cùng NCC — `supplierId` ở
 * đây là chốt bất biến đó, service-enforced (`E187`). `requiresIqc` tự sinh N `quality_inspections`
 * (`kind = INCOMING`) lúc tạo, không gate `create`. Không gắn kho — hàng gia công ngoài là WIP, không
 * quản tồn theo kho
 * (`docs/decisions/wip-not-stocked.md`). Không có nháp — cùng lý do `outsourcing_orders`, xem
 * `docs/domains/inventory.md`, `docs/workflows/outsourcing-round-trip.md`,
 * `docs/decisions/outsourcing-no-draft.md`.
 */
export const outsourcingReceipts = pgTable(
  'outsourcing_receipts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: varchar('code', { length: 50 }).notNull().unique(),
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => suppliers.id, { onDelete: 'restrict' }),
    receiptDate: date('receipt_date', { mode: 'date' }).notNull(),
    requiresIqc: boolean('requires_iqc').notNull().default(false),
    status: outsourcingReceiptStatusEnum('status')
      .notNull()
      .default(OutsourcingReceiptStatus.POSTED),
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
    index('idx_outsourcing_receipts_supplier_id').on(table.supplierId),
    index('idx_outsourcing_receipts_status').on(table.status),
    index('idx_outsourcing_receipts_receipt_date').on(table.receiptDate),
    index('idx_outsourcing_receipts_created_by').on(table.createdBy),
  ],
);

export const outsourcingReceiptsRelations = relations(
  outsourcingReceipts,
  ({ one, many }) => ({
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
