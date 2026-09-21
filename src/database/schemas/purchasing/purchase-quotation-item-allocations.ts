import { relations, sql } from 'drizzle-orm';
import {
  check,
  index,
  numeric,
  pgTable,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { purchaseRequestItems } from '../purchase-requests/purchase-request-items';
import { purchaseQuotationItems } from './purchase-quotation-items';

/**
 * SL báo giá của một vật tư, phân bổ về từng dòng ĐXMH nguồn đã gộp vào đó — nguồn duy nhất của SL
 * báo giá: sổ cái mua hàng (`quotedQuantitySubquery`) đọc thẳng ở đây, và duyệt báo giá fan-out mỗi
 * phân bổ thành một dòng PO (`docs/domains/purchasing.md`).
 */
export const purchaseQuotationItemAllocations = pgTable(
  'purchase_quotation_item_allocations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    quotationItemId: uuid('quotation_item_id')
      .notNull()
      .references(() => purchaseQuotationItems.id, { onDelete: 'cascade' }),
    purchaseRequestItemId: uuid('purchase_request_item_id')
      .notNull()
      .references(() => purchaseRequestItems.id, { onDelete: 'restrict' }),
    quantity: numeric('quantity', {
      precision: 18,
      scale: 3,
      mode: 'number',
    }).notNull(),
    // Lý do khi SL phân bổ khác SL đề xuất gốc của dòng ĐXMH này — text tự do.
    quantityAdjustmentReason: varchar('quantity_adjustment_reason', {
      length: 500,
    }),
  },
  (table) => [
    index('idx_purchase_quotation_item_allocations_quotation_item_id').on(
      table.quotationItemId,
    ),
    index(
      'idx_purchase_quotation_item_allocations_purchase_request_item_id',
    ).on(table.purchaseRequestItemId),
    unique('uq_purchase_quotation_item_allocations_item_request').on(
      table.quotationItemId,
      table.purchaseRequestItemId,
    ),
    check(
      'chk_purchase_quotation_item_allocations_quantity_positive',
      sql`quantity > 0`,
    ),
  ],
);

export const purchaseQuotationItemAllocationsRelations = relations(
  purchaseQuotationItemAllocations,
  ({ one }) => ({
    quotationItem: one(purchaseQuotationItems, {
      fields: [purchaseQuotationItemAllocations.quotationItemId],
      references: [purchaseQuotationItems.id],
    }),
    purchaseRequestItem: one(purchaseRequestItems, {
      fields: [purchaseQuotationItemAllocations.purchaseRequestItemId],
      references: [purchaseRequestItems.id],
    }),
  }),
);

export type PurchaseQuotationItemAllocationSelect =
  typeof purchaseQuotationItemAllocations.$inferSelect;
