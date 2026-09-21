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
} from 'drizzle-orm/pg-core';

import { items } from '../items/items';
import { orderItems } from '../orders/order-items';
import { users } from '../identity-access/users';

/** `_IN`/`RECEIPT` cộng tồn, `_OUT`/`ISSUE` trừ tồn — dấu bắt buộc khớp `type` (DB CHECK
 * `chk_inventory_transactions_quantity_sign`). `TRANSFER_IN`/`TRANSFER_OUT` là chỗ cắm cho chuyển
 * kho, chưa route nào phát ra (`docs/domains/inventory.md`). */
export enum InventoryTransactionType {
  RECEIPT = 'RECEIPT',
  ISSUE = 'ISSUE',
  TRANSFER_IN = 'TRANSFER_IN',
  TRANSFER_OUT = 'TRANSFER_OUT',
  PRODUCTION_IN = 'PRODUCTION_IN',
  PRODUCTION_OUT = 'PRODUCTION_OUT',
  ADJUSTMENT_IN = 'ADJUSTMENT_IN',
  ADJUSTMENT_OUT = 'ADJUSTMENT_OUT',
}

export const inventoryTransactionTypeEnum = pgEnum(
  'inventory_transaction_type',
  [
    InventoryTransactionType.RECEIPT,
    InventoryTransactionType.ISSUE,
    InventoryTransactionType.TRANSFER_IN,
    InventoryTransactionType.TRANSFER_OUT,
    InventoryTransactionType.PRODUCTION_IN,
    InventoryTransactionType.PRODUCTION_OUT,
    InventoryTransactionType.ADJUSTMENT_IN,
    InventoryTransactionType.ADJUSTMENT_OUT,
  ],
);

export enum InventoryReferenceType {
  INVENTORY_RECEIPT = 'INVENTORY_RECEIPT',
  INVENTORY_ISSUE = 'INVENTORY_ISSUE',
  INVENTORY_ADJUSTMENT = 'INVENTORY_ADJUSTMENT',
  SUPPLIER_RETURN = 'SUPPLIER_RETURN',
  // Gia công ngoài không còn ghi `inventory_transactions` (`docs/decisions/wip-not-stocked.md`) —
  // giữ 2 giá trị này chỉ để tương thích bút toán cũ/`GET /inventory/transactions?referenceType=`.
  OUTSOURCING_ORDER = 'OUTSOURCING_ORDER',
  OUTSOURCING_RECEIPT = 'OUTSOURCING_RECEIPT',
}

export const inventoryReferenceTypeEnum = pgEnum('inventory_reference_type', [
  InventoryReferenceType.INVENTORY_RECEIPT,
  InventoryReferenceType.INVENTORY_ISSUE,
  InventoryReferenceType.INVENTORY_ADJUSTMENT,
  InventoryReferenceType.SUPPLIER_RETURN,
  InventoryReferenceType.OUTSOURCING_ORDER,
  InventoryReferenceType.OUTSOURCING_RECEIPT,
]);

/**
 * Sổ cái kho — append-only, nguồn sự thật. Chỉ `InventoryPostingService.postDocument`/
 * `reverseDocument` được ghi vào bảng này (`docs/domains/inventory.md`).
 *
 * Rules:
 * - `referenceId` trỏ về `inventory_receipts`/`inventory_issues`/`inventory_adjustments`/
 *   `supplier_returns`/`outsourcing_orders`/`outsourcing_receipts` theo `referenceType` — cố ý
 *   không FK vì đa hình, DB không tự kiểm được.
 * - Không `updatedAt`/xoá mềm — sửa sai bằng bút toán đảo dấu mới, không sửa/xoá bút toán cũ.
 */
export const inventoryTransactions = pgTable(
  'inventory_transactions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'restrict' }),
    type: inventoryTransactionTypeEnum('type').notNull(),
    quantity: numeric('quantity', {
      precision: 18,
      scale: 3,
      mode: 'number',
    }).notNull(),
    referenceType: inventoryReferenceTypeEnum('reference_type').notNull(),
    referenceId: uuid('reference_id').notNull(),
    orderItemId: uuid('order_item_id').references(() => orderItems.id, {
      onDelete: 'restrict',
    }),
    transactionDate: date('transaction_date', { mode: 'date' }).notNull(),
    createdBy: uuid('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_inventory_transactions_item_id').on(table.itemId),
    index('idx_inventory_transactions_order_item_id').on(table.orderItemId),
    index('idx_inventory_transactions_type').on(table.type),
    index('idx_inventory_transactions_transaction_date').on(
      table.transactionDate,
    ),
    index('idx_inventory_transactions_reference').on(
      table.referenceType,
      table.referenceId,
    ),
    index('idx_inventory_transactions_created_by').on(table.createdBy),
    check(
      'chk_inventory_transactions_quantity_sign',
      sql`(type IN ('RECEIPT', 'TRANSFER_IN', 'PRODUCTION_IN', 'ADJUSTMENT_IN') AND quantity > 0)
          OR (type IN ('ISSUE', 'TRANSFER_OUT', 'PRODUCTION_OUT', 'ADJUSTMENT_OUT') AND quantity < 0)`,
    ),
  ],
);

export const inventoryTransactionsRelations = relations(
  inventoryTransactions,
  ({ one }) => ({
    item: one(items, {
      fields: [inventoryTransactions.itemId],
      references: [items.id],
    }),
    orderItem: one(orderItems, {
      fields: [inventoryTransactions.orderItemId],
      references: [orderItems.id],
    }),
    creatorBy: one(users, {
      fields: [inventoryTransactions.createdBy],
      references: [users.id],
    }),
  }),
);

export type InventoryTransactionSelect =
  typeof inventoryTransactions.$inferSelect;
