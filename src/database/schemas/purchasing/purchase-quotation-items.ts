import { relations } from 'drizzle-orm';
import { index, pgTable, unique, uuid } from 'drizzle-orm/pg-core';

import { items } from '../items/items';
import { purchaseQuotationItemAllocations } from './purchase-quotation-item-allocations';
import { purchaseQuotationItemSuppliers } from './purchase-quotation-item-suppliers';
import { purchaseQuotations } from './purchase-quotations';

/**
 * Một vật tư được hỏi giá trong một phiếu báo giá. Bảng không giữ số lượng — SL báo giá là `SUM`
 * của `purchase_quotation_item_allocations.quantity`, tính lúc đọc, để SL chỉ sống một chỗ
 * (`docs/domains/purchasing.md`).
 */
export const purchaseQuotationItems = pgTable(
  'purchase_quotation_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    quotationId: uuid('quotation_id')
      .notNull()
      .references(() => purchaseQuotations.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'restrict' }),
  },
  (table) => [
    index('idx_purchase_quotation_items_quotation_id').on(table.quotationId),
    index('idx_purchase_quotation_items_item_id').on(table.itemId),
    unique('uq_purchase_quotation_items_quotation_item').on(
      table.quotationId,
      table.itemId,
    ),
  ],
);

export const purchaseQuotationItemsRelations = relations(
  purchaseQuotationItems,
  ({ one, many }) => ({
    quotation: one(purchaseQuotations, {
      fields: [purchaseQuotationItems.quotationId],
      references: [purchaseQuotations.id],
    }),
    item: one(items, {
      fields: [purchaseQuotationItems.itemId],
      references: [items.id],
    }),
    allocations: many(purchaseQuotationItemAllocations),
    suppliers: many(purchaseQuotationItemSuppliers),
  }),
);

export type PurchaseQuotationItemSelect =
  typeof purchaseQuotationItems.$inferSelect;
