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

import { inventoryItemTypeEnum } from './inventory-documents';
import { warehouses } from './warehouses';
import { materials } from '../materials/materials';
import { orderItems } from '../orders/order-items';
import { products } from '../products/products';
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
}

export const inventoryReferenceTypeEnum = pgEnum('inventory_reference_type', [
  InventoryReferenceType.INVENTORY_RECEIPT,
  InventoryReferenceType.INVENTORY_ISSUE,
]);

/**
 * Sổ cái kho — append-only, nguồn sự thật. Chỉ `InventoryPostingService.postDocument`/
 * `reverseDocument` được ghi vào bảng này (`docs/domains/inventory.md`).
 *
 * Rules:
 * - `referenceId` trỏ về `inventory_receipts`/`inventory_issues` theo `referenceType` — cố ý
 *   không FK vì đa hình, DB không tự kiểm được.
 * - Không `updatedAt`/xoá mềm — sửa sai bằng bút toán đảo dấu mới, không sửa/xoá bút toán cũ.
 */
export const inventoryTransactions = pgTable(
  'inventory_transactions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    warehouseId: uuid('warehouse_id')
      .notNull()
      .references(() => warehouses.id, { onDelete: 'restrict' }),
    itemType: inventoryItemTypeEnum('item_type').notNull(),
    productId: uuid('product_id').references(() => products.id, {
      onDelete: 'restrict',
    }),
    materialId: uuid('material_id').references(() => materials.id, {
      onDelete: 'restrict',
    }),
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
    index('idx_inventory_transactions_warehouse_id').on(table.warehouseId),
    index('idx_inventory_transactions_product_id').on(table.productId),
    index('idx_inventory_transactions_material_id').on(table.materialId),
    index('idx_inventory_transactions_order_item_id').on(table.orderItemId),
    index('idx_inventory_transactions_type').on(table.type),
    index('idx_inventory_transactions_transaction_date').on(
      table.transactionDate,
    ),
    index('idx_inventory_transactions_reference').on(
      table.referenceType,
      table.referenceId,
    ),
    index('idx_inventory_transactions_warehouse_product').on(
      table.warehouseId,
      table.productId,
    ),
    index('idx_inventory_transactions_warehouse_material').on(
      table.warehouseId,
      table.materialId,
    ),
    check(
      'chk_inventory_transactions_target',
      sql`(item_type = 'PRODUCT' AND product_id IS NOT NULL AND material_id IS NULL) OR (item_type = 'MATERIAL' AND material_id IS NOT NULL AND product_id IS NULL)`,
    ),
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
    warehouse: one(warehouses, {
      fields: [inventoryTransactions.warehouseId],
      references: [warehouses.id],
    }),
    product: one(products, {
      fields: [inventoryTransactions.productId],
      references: [products.id],
    }),
    material: one(materials, {
      fields: [inventoryTransactions.materialId],
      references: [materials.id],
    }),
    orderItem: one(orderItems, {
      fields: [inventoryTransactions.orderItemId],
      references: [orderItems.id],
    }),
    creator: one(users, {
      fields: [inventoryTransactions.createdBy],
      references: [users.id],
    }),
  }),
);
