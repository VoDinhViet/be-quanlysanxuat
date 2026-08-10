import { relations, sql } from 'drizzle-orm';
import {
  check,
  index,
  numeric,
  pgTable,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { purchaseRequestItems } from '../purchase-requests/purchase-request-items';
import { purchaseOrders } from './purchase-orders';
import { purchaseQuotationItems } from './purchase-quotation-items';

/**
 * Một dòng đơn mua — SL/giá đặt mua cho một dòng đề xuất. `quotationItemId` tuỳ chọn, chỉ để trace
 * về báo giá đã chốt (`docs/domains/purchasing.md`) — đơn mua có thể lập thẳng, không qua báo giá.
 */
export const purchaseOrderItems = pgTable(
  'purchase_order_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    purchaseOrderId: uuid('purchase_order_id')
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: 'cascade' }),
    purchaseRequestItemId: uuid('purchase_request_item_id')
      .notNull()
      .references(() => purchaseRequestItems.id, { onDelete: 'restrict' }),
    quotationItemId: uuid('quotation_item_id').references(
      () => purchaseQuotationItems.id,
      { onDelete: 'set null' },
    ),
    quantity: numeric('quantity', {
      precision: 18,
      scale: 3,
      mode: 'number',
    }).notNull(),
    unitPrice: numeric('unit_price', {
      precision: 18,
      scale: 2,
      mode: 'number',
    }),
    note: varchar('note', { length: 500 }),
  },
  (table) => [
    index('idx_purchase_order_items_purchase_order_id').on(
      table.purchaseOrderId,
    ),
    index('idx_purchase_order_items_purchase_request_item_id').on(
      table.purchaseRequestItemId,
    ),
    index('idx_purchase_order_items_quotation_item_id').on(
      table.quotationItemId,
    ),
    check('chk_purchase_order_items_quantity_positive', sql`quantity > 0`),
    check(
      'chk_purchase_order_items_unit_price',
      sql`unit_price IS NULL OR unit_price >= 0`,
    ),
  ],
);

export const purchaseOrderItemsRelations = relations(
  purchaseOrderItems,
  ({ one }) => ({
    purchaseOrder: one(purchaseOrders, {
      fields: [purchaseOrderItems.purchaseOrderId],
      references: [purchaseOrders.id],
    }),
    purchaseRequestItem: one(purchaseRequestItems, {
      fields: [purchaseOrderItems.purchaseRequestItemId],
      references: [purchaseRequestItems.id],
    }),
    quotationItem: one(purchaseQuotationItems, {
      fields: [purchaseOrderItems.quotationItemId],
      references: [purchaseQuotationItems.id],
    }),
  }),
);
