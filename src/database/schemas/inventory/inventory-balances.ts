import { relations, sql } from 'drizzle-orm';
import { check, numeric, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';

import { items } from '../items/items';

/**
 * Tồn hiện tại — một dòng/mặt hàng, dựng lại được 100% từ `inventory_transactions`
 * (`docs/domains/inventory.md`). Ghi duy nhất qua `InventoryPostingService`.
 *
 * Rules:
 * - `quantity` không bao giờ âm (DB CHECK) — chốt chặn thật, khác thiết kế cũ chỉ kiểm ở service.
 * - "Đã giữ"/`reserved` không có cột riêng — `GET /inventory/balances` tính động ở tầng đọc, xem
 *   `InventoryService.getInventoryBalances`.
 */
export const inventoryBalances = pgTable(
  'inventory_balances',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    itemId: uuid('item_id')
      .notNull()
      .unique()
      .references(() => items.id, { onDelete: 'restrict' }),
    quantity: numeric('quantity', {
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
  () => [
    check('chk_inventory_balances_quantity_non_negative', sql`quantity >= 0`),
  ],
);

export const inventoryBalancesRelations = relations(
  inventoryBalances,
  ({ one }) => ({
    item: one(items, {
      fields: [inventoryBalances.itemId],
      references: [items.id],
    }),
  }),
);

export type InventoryBalanceSelect = typeof inventoryBalances.$inferSelect;
