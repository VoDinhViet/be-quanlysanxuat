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
import { purchaseQuotationItemSuppliers } from './purchase-quotation-item-suppliers';
import { purchaseQuotations } from './purchase-quotations';

/**
 * Một dòng vật tư của báo giá. `quantity` chỉ sống **một lần** ở đây dù bao nhiêu NCC báo giá — sổ
 * cái mua hàng SUM thẳng cột này (`purchase-ledger.query.ts`), nhân dòng theo NCC sẽ làm
 * `quotedQuantity` sai. Giá/NCC nằm ở `purchase_quotation_item_suppliers`
 * (`docs/domains/purchasing.md`).
 */
export const purchaseQuotationItems = pgTable(
  'purchase_quotation_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    quotationId: uuid('quotation_id')
      .notNull()
      .references(() => purchaseQuotations.id, { onDelete: 'cascade' }),
    purchaseRequestItemId: uuid('purchase_request_item_id')
      .notNull()
      .references(() => purchaseRequestItems.id, { onDelete: 'restrict' }),
    quantity: numeric('quantity', {
      precision: 18,
      scale: 3,
      mode: 'number',
    }).notNull(),
    // Lý do khi SL báo giá khác SL đề xuất gốc (vd mua gộp, tồn tối thiểu NCC) — text tự do.
    quantityAdjustmentReason: varchar('quantity_adjustment_reason', {
      length: 500,
    }),
  },
  (table) => [
    index('idx_purchase_quotation_items_quotation_id').on(table.quotationId),
    index('idx_purchase_quotation_items_purchase_request_item_id').on(
      table.purchaseRequestItemId,
    ),
    unique('uq_purchase_quotation_items_quotation_request_item').on(
      table.quotationId,
      table.purchaseRequestItemId,
    ),
    check('chk_purchase_quotation_items_quantity_positive', sql`quantity > 0`),
  ],
);

export const purchaseQuotationItemsRelations = relations(
  purchaseQuotationItems,
  ({ one, many }) => ({
    quotation: one(purchaseQuotations, {
      fields: [purchaseQuotationItems.quotationId],
      references: [purchaseQuotations.id],
    }),
    purchaseRequestItem: one(purchaseRequestItems, {
      fields: [purchaseQuotationItems.purchaseRequestItemId],
      references: [purchaseRequestItems.id],
    }),
    suppliers: many(purchaseQuotationItemSuppliers),
  }),
);

export type PurchaseQuotationItemSelect =
  typeof purchaseQuotationItems.$inferSelect;
