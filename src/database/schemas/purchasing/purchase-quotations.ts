import { relations } from 'drizzle-orm';
import {
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
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  APPROVED = 'APPROVED',
  CANCELLED = 'CANCELLED',
}

export const purchaseQuotationStatusEnum = pgEnum('purchase_quotation_status', [
  PurchaseQuotationStatus.DRAFT,
  PurchaseQuotationStatus.PENDING_APPROVAL,
  PurchaseQuotationStatus.APPROVED,
  PurchaseQuotationStatus.CANCELLED,
]);

/**
 * Báo giá (RFQ) — header cho một nhóm dòng vật tư, mỗi vật tư mang danh sách NCC được hỏi giá
 * (`purchase_quotation_items` → `purchase_quotation_item_suppliers`, `docs/domains/purchasing.md`).
 * `DRAFT → PENDING_APPROVAL → APPROVED`, hoặc `CANCELLED` từ `PENDING_APPROVAL`; `APPROVED` gỡ
 * được về `DRAFT` qua `recall` (`docs/workflows/rfq-approval.md`).
 */
export const purchaseQuotations = pgTable(
  'purchase_quotations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: varchar('code', { length: 50 }).notNull().unique(),
    status: purchaseQuotationStatusEnum('status')
      .notNull()
      .default(PurchaseQuotationStatus.DRAFT),
    note: varchar('note', { length: 1000 }),
    sentBy: uuid('sent_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    sentAt: timestamp('sent_at'),
    approvedBy: uuid('approved_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    approvedAt: timestamp('approved_at'),
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
    index('idx_purchase_quotations_sent_by').on(table.sentBy),
    index('idx_purchase_quotations_approved_by').on(table.approvedBy),
    index('idx_purchase_quotations_cancelled_by').on(table.cancelledBy),
  ],
);

export const purchaseQuotationsRelations = relations(
  purchaseQuotations,
  ({ one, many }) => ({
    senderBy: one(users, {
      fields: [purchaseQuotations.sentBy],
      references: [users.id],
    }),
    approverBy: one(users, {
      fields: [purchaseQuotations.approvedBy],
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

export type PurchaseQuotationSelect = typeof purchaseQuotations.$inferSelect;
