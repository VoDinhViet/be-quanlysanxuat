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
import { purchaseQuotationItemSuppliers } from './purchase-quotation-item-suppliers';

/**
 * Một dòng đơn mua — SL/giá đặt mua cho một dòng đề xuất. `quotationItemSupplierId` tuỳ chọn, trỏ
 * **dòng NCC** đã chốt (không phải dòng vật tư) — đó là nơi giữ đồng thời NCC + giá đã thoả thuận
 * (`docs/domains/purchasing.md`). Đơn mua có thể lập thẳng, không qua báo giá.
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
    quotationItemSupplierId: uuid('quotation_item_supplier_id').references(
      () => purchaseQuotationItemSuppliers.id,
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
    // Lý do khi SL đặt khác SL báo giá RFQ (vd mua gộp, tồn tối thiểu NCC) — text tự do. Khi PO
    // sinh từ duyệt RFQ, copy 1:1 từ `purchase_quotation_item_allocations.quantityAdjustmentReason`
    // của đúng phân bổ đó (`PurchaseOrdersService.createDraftOrdersFromQuotation`); PO lập thẳng
    // hoặc sửa sau thì nhập tay qua `PATCH .../items/:id`.
    quantityAdjustmentReason: varchar('quantity_adjustment_reason', {
      length: 500,
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
    index('idx_purchase_order_items_quotation_item_supplier_id').on(
      table.quotationItemSupplierId,
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
    quotationItemSupplier: one(purchaseQuotationItemSuppliers, {
      fields: [purchaseOrderItems.quotationItemSupplierId],
      references: [purchaseQuotationItemSuppliers.id],
    }),
  }),
);

export type PurchaseOrderItemSelect = typeof purchaseOrderItems.$inferSelect;
