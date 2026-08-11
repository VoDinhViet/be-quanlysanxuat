import { relations, sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  numeric,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { purchaseRequestItems } from '../purchase-requests/purchase-request-items';
import { suppliers } from '../suppliers/suppliers';
import { users } from '../identity-access/users';
import { purchaseQuotations } from './purchase-quotations';

/**
 * Một dòng báo giá — giá của một NCC (`supplierId`, tự chọn theo dòng, không lấy từ header) cho một
 * dòng đề xuất mua hàng. `unitPrice` nullable đến khi NCC trả giá. `selectedAt` có giá trị nghĩa là
 * dòng này được chốt để đặt mua — mỗi `purchaseRequestItemId` chỉ được chốt ở tối đa một dòng báo
 * giá đang sống, do service giữ bất biến này, không phải DB (`docs/domains/purchasing.md`).
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
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => suppliers.id, { onDelete: 'restrict' }),
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
    leadTimeDays: integer('lead_time_days'),
    note: varchar('note', { length: 500 }),
    selectedBy: uuid('selected_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    selectedAt: timestamp('selected_at'),
  },
  (table) => [
    index('idx_purchase_quotation_items_quotation_id').on(table.quotationId),
    index('idx_purchase_quotation_items_purchase_request_item_id').on(
      table.purchaseRequestItemId,
    ),
    index('idx_purchase_quotation_items_supplier_id').on(table.supplierId),
    check('chk_purchase_quotation_items_quantity_positive', sql`quantity > 0`),
    check(
      'chk_purchase_quotation_items_unit_price',
      sql`unit_price IS NULL OR unit_price >= 0`,
    ),
  ],
);

export const purchaseQuotationItemsRelations = relations(
  purchaseQuotationItems,
  ({ one }) => ({
    quotation: one(purchaseQuotations, {
      fields: [purchaseQuotationItems.quotationId],
      references: [purchaseQuotations.id],
    }),
    purchaseRequestItem: one(purchaseRequestItems, {
      fields: [purchaseQuotationItems.purchaseRequestItemId],
      references: [purchaseRequestItems.id],
    }),
    supplier: one(suppliers, {
      fields: [purchaseQuotationItems.supplierId],
      references: [suppliers.id],
    }),
    selectorBy: one(users, {
      fields: [purchaseQuotationItems.selectedBy],
      references: [users.id],
    }),
  }),
);
