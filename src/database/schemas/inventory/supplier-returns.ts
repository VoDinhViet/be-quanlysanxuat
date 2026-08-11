import { relations, sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  numeric,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import {
  InventoryDocumentStatus,
  inventoryDocumentStatusEnum,
} from './inventory-documents';
import { inventoryReceipts } from './inventory-receipts';
import { warehouses } from './warehouses';
import { items } from '../items/items';
import { purchaseOrders } from '../purchasing/purchase-orders';
import { suppliers } from '../suppliers/suppliers';
import { users } from '../identity-access/users';

/**
 * Phiếu trả NCC — bảng phẳng, 1 phiếu = đúng 1 dòng vật tư (không có bảng con). Chỉ có route
 * `GET` list ở đợt này — chưa có `post`/`cancel` nên `postedBy`/`cancelledBy`/... chưa xuất hiện
 * (`docs/domains/inventory.md`).
 */
export const supplierReturns = pgTable(
  'supplier_returns',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: varchar('code', { length: 50 }).notNull().unique(),
    warehouseId: uuid('warehouse_id')
      .notNull()
      .references(() => warehouses.id, { onDelete: 'restrict' }),
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => suppliers.id, { onDelete: 'restrict' }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'restrict' }),
    quantity: numeric('quantity', {
      precision: 18,
      scale: 3,
      mode: 'number',
    }).notNull(),
    purchaseOrderId: uuid('purchase_order_id').references(
      () => purchaseOrders.id,
      { onDelete: 'set null' },
    ),
    inventoryReceiptId: uuid('inventory_receipt_id').references(
      () => inventoryReceipts.id,
      { onDelete: 'set null' },
    ),
    // Chưa có module IQC thật — text tự do, chờ tới khi có bảng kiểm tra chất lượng thì đổi sang FK.
    iqcCode: varchar('iqc_code', { length: 50 }),
    returnDate: date('return_date', { mode: 'date' }).notNull(),
    status: inventoryDocumentStatusEnum('status')
      .notNull()
      .default(InventoryDocumentStatus.DRAFT),
    note: varchar('note', { length: 1000 }),
    createdBy: uuid('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('idx_supplier_returns_warehouse_id').on(table.warehouseId),
    index('idx_supplier_returns_supplier_id').on(table.supplierId),
    index('idx_supplier_returns_item_id').on(table.itemId),
    index('idx_supplier_returns_purchase_order_id').on(table.purchaseOrderId),
    index('idx_supplier_returns_inventory_receipt_id').on(
      table.inventoryReceiptId,
    ),
    index('idx_supplier_returns_status').on(table.status),
    index('idx_supplier_returns_return_date').on(table.returnDate),
    index('idx_supplier_returns_created_by').on(table.createdBy),
    check('chk_supplier_returns_quantity_positive', sql`quantity > 0`),
  ],
);

export const supplierReturnsRelations = relations(
  supplierReturns,
  ({ one }) => ({
    warehouse: one(warehouses, {
      fields: [supplierReturns.warehouseId],
      references: [warehouses.id],
    }),
    supplier: one(suppliers, {
      fields: [supplierReturns.supplierId],
      references: [suppliers.id],
    }),
    item: one(items, {
      fields: [supplierReturns.itemId],
      references: [items.id],
    }),
    purchaseOrder: one(purchaseOrders, {
      fields: [supplierReturns.purchaseOrderId],
      references: [purchaseOrders.id],
    }),
    inventoryReceipt: one(inventoryReceipts, {
      fields: [supplierReturns.inventoryReceiptId],
      references: [inventoryReceipts.id],
    }),
    creatorBy: one(users, {
      fields: [supplierReturns.createdBy],
      references: [users.id],
    }),
  }),
);
