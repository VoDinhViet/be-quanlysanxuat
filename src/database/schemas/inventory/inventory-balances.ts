import { relations, sql } from 'drizzle-orm';
import {
  check,
  index,
  numeric,
  pgTable,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { warehouses } from './warehouses';
import { items } from '../items/items';

/**
 * Tồn hiện tại — một dòng/(kho × mặt hàng), dựng lại được 100% từ `inventory_transactions`
 * (`docs/domains/inventory.md`). Ghi duy nhất qua `InventoryPostingService`.
 *
 * Rules:
 * - `quantity` không bao giờ âm (DB CHECK) — chốt chặn thật, khác thiết kế cũ chỉ kiểm ở service.
 * - `reservedQuantity` có cột nhưng chưa route nào ghi, luôn 0 — giữ hàng thật là feature riêng.
 */
export const inventoryBalances = pgTable(
  'inventory_balances',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    warehouseId: uuid('warehouse_id')
      .notNull()
      .references(() => warehouses.id, { onDelete: 'restrict' }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'restrict' }),
    quantity: numeric('quantity', {
      precision: 18,
      scale: 3,
      mode: 'number',
    })
      .notNull()
      .default(0),
    reservedQuantity: numeric('reserved_quantity', {
      precision: 18,
      scale: 3,
      mode: 'number',
    })
      .notNull()
      .default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique('uq_inventory_balances_warehouse_item').on(
      table.warehouseId,
      table.itemId,
    ),
    // Đứng riêng ngoài composite unique — `inventory.service.ts`/`item-stock.query.ts` đều
    // `GROUP BY itemId` không kèm `warehouseId`, cột dẫn đầu của composite index không phủ được
    // truy vấn đó.
    index('idx_inventory_balances_item_id').on(table.itemId),
    check('chk_inventory_balances_quantity_non_negative', sql`quantity >= 0`),
    check(
      'chk_inventory_balances_reserved_quantity_non_negative',
      sql`reserved_quantity >= 0`,
    ),
  ],
);

export const inventoryBalancesRelations = relations(
  inventoryBalances,
  ({ one }) => ({
    warehouse: one(warehouses, {
      fields: [inventoryBalances.warehouseId],
      references: [warehouses.id],
    }),
    item: one(items, {
      fields: [inventoryBalances.itemId],
      references: [items.id],
    }),
  }),
);

export type InventoryBalanceSelect = typeof inventoryBalances.$inferSelect;
