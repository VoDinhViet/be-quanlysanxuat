import { relations, sql } from 'drizzle-orm';
import {
  check,
  index,
  numeric,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { items } from '../items/items';
import { purchaseOrderItems } from '../purchasing/purchase-order-items';
import { purchaseQuotationItems } from '../purchasing/purchase-quotation-items';
import { users } from '../identity-access/users';
import { purchaseRequests } from './purchase-requests';

/**
 * Một dòng vật tư của đề xuất mua hàng. Chưa có route ghi trực tiếp — đọc qua
 * `GET /purchase-requests` (lọc theo tên/mã vật tư trong dòng) và
 * `GET /purchase-requests/:purchaseRequestId` (trả nguyên dòng, kèm tồn hiện tại). Sổ cái mua hàng
 * (`docs/domains/purchasing.md`) đọc mọi dòng của phiếu `APPROVED`, hủy tay qua 3 cột
 * `cancelled*` bên dưới — chỉ khi dòng chưa có đơn mua sống.
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
    note: varchar('note', { length: 500 }),
    cancelledBy: uuid('cancelled_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    cancelledAt: timestamp('cancelled_at'),
    cancellationReason: varchar('cancellation_reason', { length: 500 }),
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
  ({ one, many }) => ({
    purchaseRequest: one(purchaseRequests, {
      fields: [purchaseRequestItems.purchaseRequestId],
      references: [purchaseRequests.id],
    }),
    item: one(items, {
      fields: [purchaseRequestItems.itemId],
      references: [items.id],
    }),
    cancellerBy: one(users, {
      fields: [purchaseRequestItems.cancelledBy],
      references: [users.id],
    }),
    quotationItems: many(purchaseQuotationItems),
    orderItems: many(purchaseOrderItems),
  }),
);
