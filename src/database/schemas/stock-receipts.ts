import { relations, sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  numeric,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { credentials } from './credentials';
import { orderItems } from './orders';
import { products } from './products';

/** IN adds to on-hand stock, OUT subtracts. The sign lives entirely in `type` — `quantity` on a
 * line is always positive (see `stock_receipt_items` CHECK below), never negative. */
export enum StockReceiptType {
  IN = 'IN',
  OUT = 'OUT',
}

export const stockReceiptTypeEnum = pgEnum('stock_receipt_type', [
  StockReceiptType.IN,
  StockReceiptType.OUT,
]);

/**
 * Rules:
 * - Must match `type` — enforced both by `chk_stock_receipts_reason_type` below and by
 *   `StockReceiptsService` (for a clean `E073` instead of a raw constraint-violation 500).
 * - No dedicated "adjustment" reason: a stocktake surplus is an `IN`/`STOCKTAKE` receipt, a
 *   shortage is an `OUT`/`STOCKTAKE` receipt — one fewer state without losing anything expressible.
 */
export enum StockReceiptReason {
  PRODUCTION = 'PRODUCTION',
  OPENING = 'OPENING',
  STOCKTAKE = 'STOCKTAKE',
  DELIVERY = 'DELIVERY',
  OTHER = 'OTHER',
}

export const stockReceiptReasonEnum = pgEnum('stock_receipt_reason', [
  StockReceiptReason.PRODUCTION,
  StockReceiptReason.OPENING,
  StockReceiptReason.STOCKTAKE,
  StockReceiptReason.DELIVERY,
  StockReceiptReason.OTHER,
]);

/**
 * Stock receipt header ("Phiếu nhập/xuất kho thành phẩm").
 *
 * Rules:
 * - No on-hand/reserved/available column anywhere — every number `InventoryService` reports is
 *   computed at read time from `stock_receipt_items` (and, for "reserved", `order_items`), so it
 *   can never drift from the ledger that produced it.
 * - Freely editable/soft-deletable, no `orders`-style terminal-status lock — but
 *   `StockReceiptsService` still refuses a write that would drive any product's on-hand quantity
 *   negative (`E071`).
 */
export const stockReceipts = pgTable(
  'stock_receipts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: varchar('code', { length: 50 }).notNull().unique(),
    type: stockReceiptTypeEnum('type').notNull(),
    reason: stockReceiptReasonEnum('reason').notNull(),
    receiptDate: date('receipt_date', { mode: 'date' }).notNull(),
    note: varchar('note', { length: 1000 }),
    createdBy: uuid('created_by').references(() => credentials.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp('deleted_at'),
  },
  (table) => [
    index('idx_stock_receipts_created_by').on(table.createdBy),
    index('idx_stock_receipts_type')
      .on(table.type)
      .where(sql`deleted_at IS NULL`),
    check(
      'chk_stock_receipts_reason_type',
      sql`(type = 'IN' AND reason IN ('PRODUCTION', 'OPENING', 'STOCKTAKE', 'OTHER'))
          OR (type = 'OUT' AND reason IN ('DELIVERY', 'STOCKTAKE', 'OTHER'))`,
    ),
  ],
);

/**
 * One line of a stock receipt.
 *
 * Rules:
 * - `productId` must be a `FINISHED_GOOD` — service-enforced, not a DB CHECK, see
 *   `StockReceiptsService.ensureItemsValid`.
 * - `orderItemId` is the only link back to `orders`: on an `OUT`/`DELIVERY` line it records which
 *   PO line this stock left for — both the delivery audit trail `orders` itself doesn't have yet,
 *   and the sole signal `InventoryService.reservedSubquery` uses to know a PO line has been
 *   (partially) fulfilled. Nullable — every other reason (production receipt, stocktake, generic
 *   OUT) leaves it unset.
 */
export const stockReceiptItems = pgTable(
  'stock_receipt_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    receiptId: uuid('receipt_id')
      .notNull()
      .references(() => stockReceipts.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    quantity: numeric('quantity', {
      precision: 18,
      scale: 3,
      mode: 'number',
    }).notNull(),
    orderItemId: uuid('order_item_id').references(() => orderItems.id, {
      onDelete: 'restrict',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('idx_stock_receipt_items_receipt_id').on(table.receiptId),
    index('idx_stock_receipt_items_product_id').on(table.productId),
    index('idx_stock_receipt_items_order_item_id').on(table.orderItemId),
    check('chk_stock_receipt_items_quantity_positive', sql`quantity > 0`),
  ],
);

export const stockReceiptsRelations = relations(
  stockReceipts,
  ({ one, many }) => ({
    creator: one(credentials, {
      fields: [stockReceipts.createdBy],
      references: [credentials.id],
    }),
    items: many(stockReceiptItems),
  }),
);

export const stockReceiptItemsRelations = relations(
  stockReceiptItems,
  ({ one }) => ({
    receipt: one(stockReceipts, {
      fields: [stockReceiptItems.receiptId],
      references: [stockReceipts.id],
    }),
    product: one(products, {
      fields: [stockReceiptItems.productId],
      references: [products.id],
    }),
    orderItem: one(orderItems, {
      fields: [stockReceiptItems.orderItemId],
      references: [orderItems.id],
    }),
  }),
);
