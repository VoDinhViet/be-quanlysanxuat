import { relations, sql } from 'drizzle-orm';
import {
  check,
  numeric,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { inventoryItemTypeEnum } from './inventory-documents';
import { warehouses } from './warehouses';
import { materials } from '../materials/materials';
import { products } from '../products/products';

/**
 * Tồn hiện tại — một dòng/(kho × mặt hàng), dựng lại được 100% từ `inventory_transactions`
 * (`docs/domains/inventory.md`). Ghi duy nhất qua `InventoryPostingService`.
 *
 * Rules:
 * - `quantity` không bao giờ âm (DB CHECK) — chốt chặn thật, khác thiết kế cũ chỉ kiểm ở service.
 * - `reservedQuantity` có cột nhưng chưa route nào ghi, luôn 0 — giữ hàng thật là feature riêng.
 * - Không dùng `unique(warehouseId, productId, materialId)`: Postgres coi NULL khác nhau nên bộ ba
 *   đó vẫn cho trùng dòng. Hai partial unique index dưới đây mới thật sự chặn trùng.
 */
export const inventoryBalances = pgTable(
  'inventory_balances',
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
    uniqueIndex('uq_inventory_balances_product')
      .on(table.warehouseId, table.productId)
      .where(sql`product_id IS NOT NULL`),
    uniqueIndex('uq_inventory_balances_material')
      .on(table.warehouseId, table.materialId)
      .where(sql`material_id IS NOT NULL`),
    check(
      'chk_inventory_balances_target',
      sql`(item_type = 'PRODUCT' AND product_id IS NOT NULL AND material_id IS NULL) OR (item_type = 'MATERIAL' AND material_id IS NOT NULL AND product_id IS NULL)`,
    ),
    check('chk_inventory_balances_quantity_non_negative', sql`quantity >= 0`),
  ],
);

export const inventoryBalancesRelations = relations(
  inventoryBalances,
  ({ one }) => ({
    warehouse: one(warehouses, {
      fields: [inventoryBalances.warehouseId],
      references: [warehouses.id],
    }),
    product: one(products, {
      fields: [inventoryBalances.productId],
      references: [products.id],
    }),
    material: one(materials, {
      fields: [inventoryBalances.materialId],
      references: [materials.id],
    }),
  }),
);
