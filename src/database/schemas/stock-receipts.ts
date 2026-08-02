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

import { materials } from './materials';
import { orderItems } from './orders';
import { products } from './products';
import { users } from './users';

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
 * Kho thành phẩm ("Tồn kho thành phẩm") hay kho vật tư ("Tồn kho vật tư") — thêm 2026-07-30
 * cùng lúc `stock_receipt_items` có thêm `materialId`. Mọi dòng của một phiếu phải khớp `subject`
 * của header (service-enforced, CHECK không đọc được row cha — xem `chk_stock_receipt_items_target`
 * dưới `stock_receipt_items`). Bất biến sau khi tạo, cùng khuôn `code`.
 */
export enum StockReceiptSubject {
  FINISHED_GOOD = 'FINISHED_GOOD',
  MATERIAL = 'MATERIAL',
}

export const stockReceiptSubjectEnum = pgEnum('stock_receipt_subject', [
  StockReceiptSubject.FINISHED_GOOD,
  StockReceiptSubject.MATERIAL,
]);

/**
 * Rules:
 * - Phải khớp cả `subject` lẫn `type` — enforce ở cả `chk_stock_receipts_reason_type` dưới đây
 *   lẫn `StockReceiptsService` (để ném `E073` sạch thay vì lộ lỗi constraint 500 thô).
 * - Không có "điều chỉnh" riêng: kiểm kê thừa là phiếu `IN`/`STOCKTAKE`, thiếu là phiếu
 *   `OUT`/`STOCKTAKE` — ít trạng thái hơn mà không mất khả năng biểu đạt.
 * - `PURCHASE`/`PRODUCTION_ISSUE` thêm 2026-07-30 riêng cho `subject = MATERIAL` (nhập mua vật tư,
 *   xuất vật tư cho sản xuất) — `OPENING`/`STOCKTAKE`/`OTHER` dùng chung cho cả hai `subject`.
 */
export enum StockReceiptReason {
  PRODUCTION = 'PRODUCTION',
  OPENING = 'OPENING',
  STOCKTAKE = 'STOCKTAKE',
  DELIVERY = 'DELIVERY',
  OTHER = 'OTHER',
  PURCHASE = 'PURCHASE',
  PRODUCTION_ISSUE = 'PRODUCTION_ISSUE',
}

export const stockReceiptReasonEnum = pgEnum('stock_receipt_reason', [
  StockReceiptReason.PRODUCTION,
  StockReceiptReason.OPENING,
  StockReceiptReason.STOCKTAKE,
  StockReceiptReason.DELIVERY,
  StockReceiptReason.OTHER,
  StockReceiptReason.PURCHASE,
  StockReceiptReason.PRODUCTION_ISSUE,
]);

/**
 * Stock receipt header ("Phiếu nhập/xuất kho" — thành phẩm hoặc vật tư, xem `subject`).
 *
 * Rules:
 * - No on-hand/reserved/available column anywhere — every number `InventoryService` reports is
 *   computed at read time from `stock_receipt_items` (and, for "reserved", `order_items`), so it
 *   can never drift from the ledger that produced it.
 * - Freely editable/soft-deletable, no `orders`-style terminal-status lock — but
 *   `StockReceiptsService` still refuses a write that would drive any product's/material's
 *   on-hand quantity negative (`E071`).
 * - `subject` mặc định `FINISHED_GOOD` để backfill đúng cho phiếu đã tồn tại trước 2026-07-30
 *   (thời điểm chỉ có kho thành phẩm) — bắt buộc gửi khi tạo, bất biến khi sửa.
 */
export const stockReceipts = pgTable(
  'stock_receipts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: varchar('code', { length: 50 }).notNull().unique(),
    subject: stockReceiptSubjectEnum('subject')
      .notNull()
      .default(StockReceiptSubject.FINISHED_GOOD),
    type: stockReceiptTypeEnum('type').notNull(),
    reason: stockReceiptReasonEnum('reason').notNull(),
    receiptDate: date('receipt_date', { mode: 'date' }).notNull(),
    note: varchar('note', { length: 1000 }),
    createdBy: uuid('created_by').references(() => users.id, {
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
    index('idx_stock_receipts_subject')
      .on(table.subject)
      .where(sql`deleted_at IS NULL`),
    check(
      'chk_stock_receipts_reason_type',
      sql`(subject = 'FINISHED_GOOD' AND type = 'IN' AND reason IN ('PRODUCTION', 'OPENING', 'STOCKTAKE', 'OTHER'))
          OR (subject = 'FINISHED_GOOD' AND type = 'OUT' AND reason IN ('DELIVERY', 'STOCKTAKE', 'OTHER'))
          OR (subject = 'MATERIAL' AND type = 'IN' AND reason IN ('PURCHASE', 'OPENING', 'STOCKTAKE', 'OTHER'))
          OR (subject = 'MATERIAL' AND type = 'OUT' AND reason IN ('PRODUCTION_ISSUE', 'STOCKTAKE', 'OTHER'))`,
    ),
  ],
);

/**
 * One line of a stock receipt.
 *
 * Rules:
 * - Đúng một trong `productId`/`materialId` được set, khớp `subject` của `stockReceipts` cha —
 *   service-enforced (không phải DB CHECK, vì CHECK không đọc được row cha), xem
 *   `StockReceiptsService.ensureItemsValid`. `chk_stock_receipt_items_target` chỉ đảm bảo
 *   "đúng một trong hai", không đảm bảo khớp đúng `subject`.
 * - `productId` phải là `FINISHED_GOOD` khi có mặt — service-enforced, cùng chỗ ở trên.
 * - `orderItemId` is the only link back to `orders`: on an `OUT`/`DELIVERY` line it records which
 *   PO line this stock left for — both the delivery audit trail `orders` itself doesn't have yet,
 *   and the sole signal `InventoryService.reservedSubquery` uses to know a PO line has been
 *   (partially) fulfilled. Nullable — every other reason (production receipt, stocktake, generic
 *   OUT) leaves it unset. Chỉ hợp lệ trên dòng `productId` (`subject = FINISHED_GOOD`) — service
 *   từ chối nếu gửi trên dòng `materialId`.
 */
export const stockReceiptItems = pgTable(
  'stock_receipt_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    receiptId: uuid('receipt_id')
      .notNull()
      .references(() => stockReceipts.id, { onDelete: 'cascade' }),
    productId: uuid('product_id').references(() => products.id, {
      onDelete: 'restrict',
    }),
    materialId: uuid('material_id').references(() => materials.id, {
      onDelete: 'restrict',
    }),
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
    index('idx_stock_receipt_items_material_id').on(table.materialId),
    index('idx_stock_receipt_items_order_item_id').on(table.orderItemId),
    check('chk_stock_receipt_items_quantity_positive', sql`quantity > 0`),
    check(
      'chk_stock_receipt_items_target',
      sql`(product_id IS NOT NULL AND material_id IS NULL) OR (product_id IS NULL AND material_id IS NOT NULL)`,
    ),
  ],
);

export const stockReceiptsRelations = relations(
  stockReceipts,
  ({ one, many }) => ({
    creator: one(users, {
      fields: [stockReceipts.createdBy],
      references: [users.id],
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
    material: one(materials, {
      fields: [stockReceiptItems.materialId],
      references: [materials.id],
    }),
    orderItem: one(orderItems, {
      fields: [stockReceiptItems.orderItemId],
      references: [orderItems.id],
    }),
  }),
);
