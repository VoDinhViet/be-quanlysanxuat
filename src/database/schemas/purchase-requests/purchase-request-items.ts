import { relations, sql } from 'drizzle-orm';
import { check, index, numeric, pgTable, uuid } from 'drizzle-orm/pg-core';

import { items } from '../items/items';
import { purchaseRequests } from './purchase-requests';

/**
 * Một dòng vật tư của đề xuất mua hàng. Chưa có route ghi (giai đoạn 1 chỉ list) — bảng tồn tại
 * để `GET /purchase-requests` lọc được theo tên/mã vật tư trong dòng phiếu.
 */
export const purchaseRequestItems = pgTable(
  'purchase_request_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    purchaseRequestId: uuid('purchase_request_id')
      .notNull()
      .references(() => purchaseRequests.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'restrict' }),
    quantity: numeric('quantity', {
      precision: 18,
      scale: 3,
      mode: 'number',
    }).notNull(),
  },
  (table) => [
    index('idx_purchase_request_items_purchase_request_id').on(
      table.purchaseRequestId,
    ),
    index('idx_purchase_request_items_item_id').on(table.itemId),
    check('chk_purchase_request_items_quantity_positive', sql`quantity > 0`),
  ],
);

export const purchaseRequestItemsRelations = relations(
  purchaseRequestItems,
  ({ one }) => ({
    purchaseRequest: one(purchaseRequests, {
      fields: [purchaseRequestItems.purchaseRequestId],
      references: [purchaseRequests.id],
    }),
    item: one(items, {
      fields: [purchaseRequestItems.itemId],
      references: [items.id],
    }),
  }),
);
