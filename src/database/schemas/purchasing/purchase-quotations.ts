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

import { purchaseQuotationItems } from './purchase-quotation-items';
import { users } from '../identity-access/users';

export enum PurchaseQuotationStatus {
  DRAFT = 'DRAFT',
  SENT = 'SENT',
  RECEIVED = 'RECEIVED',
  CANCELLED = 'CANCELLED',
}

export const purchaseQuotationStatusEnum = pgEnum('purchase_quotation_status', [
  PurchaseQuotationStatus.DRAFT,
  PurchaseQuotationStatus.SENT,
  PurchaseQuotationStatus.RECEIVED,
  PurchaseQuotationStatus.CANCELLED,
]);

/**
 * Báo giá (RFQ) — hỏi giá cho một nhóm dòng đề xuất mua hàng đã duyệt, mỗi dòng tự chọn NCC riêng
 * (`supplierId` ở `purchase_quotation_items`, `docs/domains/purchasing.md`). `DRAFT → SENT →
 * RECEIVED`, hoặc `CANCELLED` từ `DRAFT`/`SENT`. `RECEIVED` mới cho `select` (chốt giá) ở
 * `purchase_quotation_items`.
 */
export const purchaseQuotations = pgTable(
  'purchase_quotations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: varchar('code', { length: 50 }).notNull().unique(),
    status: purchaseQuotationStatusEnum('status')
      .notNull()
      .default(PurchaseQuotationStatus.DRAFT),
    quotationDate: date('quotation_date', { mode: 'date' }).notNull(),
    validUntil: date('valid_until', { mode: 'date' }),
    note: varchar('note', { length: 1000 }),
    sentBy: uuid('sent_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    sentAt: timestamp('sent_at'),
    receivedBy: uuid('received_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    receivedAt: timestamp('received_at'),
    cancelledBy: uuid('cancelled_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    cancelledAt: timestamp('cancelled_at'),
    cancellationReason: varchar('cancellation_reason', { length: 1000 }),
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
    index('idx_purchase_quotations_status').on(table.status),
    index('idx_purchase_quotations_created_by').on(table.createdBy),
  ],
);

export const purchaseQuotationsRelations = relations(
  purchaseQuotations,
  ({ one, many }) => ({
    senderBy: one(users, {
      fields: [purchaseQuotations.sentBy],
      references: [users.id],
    }),
    receiverBy: one(users, {
      fields: [purchaseQuotations.receivedBy],
      references: [users.id],
    }),
    cancellerBy: one(users, {
      fields: [purchaseQuotations.cancelledBy],
      references: [users.id],
    }),
    creatorBy: one(users, {
      fields: [purchaseQuotations.createdBy],
      references: [users.id],
    }),
    items: many(purchaseQuotationItems),
  }),
);
