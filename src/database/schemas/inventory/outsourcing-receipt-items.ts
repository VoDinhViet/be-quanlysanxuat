import { relations, sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  numeric,
  pgTable,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { outsourcingOrderItems } from './outsourcing-order-items';
import { outsourcingReceipts } from './outsourcing-receipts';
import { items } from '../items/items';

/**
 * Dòng phiếu nhận gia công ngoài (OS-IN) — mỗi dòng trỏ đúng 1 dòng OS-OUT nguồn
 * (`outsourcingOrderItemId`, `restrict` — dòng nguồn không được xoá khi còn dòng nhận trỏ vào).
 * `itemId` denormalize từ dòng OS-OUT, **server tự copy, không nhận từ client** — cần cho sinh IQC
 * không phải join 2 tầng. `weight`/`area` mặc định copy từ dòng OS-OUT lúc tạo, sửa được. Xem
 * `docs/domains/inventory.md`.
 */
export const outsourcingReceiptItems = pgTable(
  'outsourcing_receipt_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    outsourcingReceiptId: uuid('outsourcing_receipt_id')
      .notNull()
      .references(() => outsourcingReceipts.id, { onDelete: 'cascade' }),
    outsourcingOrderItemId: uuid('outsourcing_order_item_id')
      .notNull()
      .references(() => outsourcingOrderItems.id, { onDelete: 'restrict' }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'restrict' }),
    quantity: numeric('quantity', {
      precision: 18,
      scale: 3,
      mode: 'number',
    }).notNull(),
    weight: numeric('weight', { precision: 12, scale: 3, mode: 'number' }),
    area: numeric('area', { precision: 12, scale: 3, mode: 'number' }),
    note: varchar('note', { length: 500 }),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('idx_outsourcing_receipt_items_outsourcing_receipt_id').on(
      table.outsourcingReceiptId,
    ),
    index('idx_outsourcing_receipt_items_outsourcing_order_item_id').on(
      table.outsourcingOrderItemId,
    ),
    index('idx_outsourcing_receipt_items_item_id').on(table.itemId),
    unique('uq_outsourcing_receipt_items_receipt_order_item').on(
      table.outsourcingReceiptId,
      table.outsourcingOrderItemId,
    ),
    check('chk_outsourcing_receipt_items_quantity_positive', sql`quantity > 0`),
    check(
      'chk_outsourcing_receipt_items_weight',
      sql`weight IS NULL OR weight >= 0`,
    ),
    check('chk_outsourcing_receipt_items_area', sql`area IS NULL OR area >= 0`),
  ],
);

export const outsourcingReceiptItemsRelations = relations(
  outsourcingReceiptItems,
  ({ one }) => ({
    outsourcingReceipt: one(outsourcingReceipts, {
      fields: [outsourcingReceiptItems.outsourcingReceiptId],
      references: [outsourcingReceipts.id],
    }),
    outsourcingOrderItem: one(outsourcingOrderItems, {
      fields: [outsourcingReceiptItems.outsourcingOrderItemId],
      references: [outsourcingOrderItems.id],
    }),
    item: one(items, {
      fields: [outsourcingReceiptItems.itemId],
      references: [items.id],
    }),
  }),
);

export type OutsourcingReceiptItemSelect =
  typeof outsourcingReceiptItems.$inferSelect;
