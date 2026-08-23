import { relations } from 'drizzle-orm';
import {
  index,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { inventoryBalances } from './inventory-balances';
import { inventoryIssues } from './inventory-issues';
import { inventoryReceipts } from './inventory-receipts';
import { inventoryTransactions } from './inventory-transactions';

/** Nhãn phân loại/lọc — KHÔNG ràng buộc mặt hàng nào được nhập/xuất vào kho này (quyết định
 * nghiệp vụ, xem `docs/domains/inventory.md`). Giá trị viết tắt, cùng khuôn `ItemType`. */
export enum WarehouseType {
  RM = 'RM',
  FG = 'FG',
  WIP = 'WIP',
}

export const warehouseTypeEnum = pgEnum('warehouse_type', [
  WarehouseType.RM,
  WarehouseType.FG,
  WarehouseType.WIP,
]);

/** Danh mục kho — không soft delete, kho vật lý hoạt động 24/7 nên không có khái niệm
 * đóng/mở (`docs/domains/inventory.md`). */
export const warehouses = pgTable(
  'warehouses',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: varchar('code', { length: 50 }).notNull().unique(),
    name: varchar('name', { length: 255 }).notNull(),
    type: warehouseTypeEnum('type').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [index('idx_warehouses_type').on(table.type)],
);

export const warehousesRelations = relations(warehouses, ({ many }) => ({
  receipts: many(inventoryReceipts),
  issues: many(inventoryIssues),
  transactions: many(inventoryTransactions),
  balances: many(inventoryBalances),
}));

export type WarehouseSelect = typeof warehouses.$inferSelect;
