import { relations, sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  numeric,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { bomItems } from './bom-items';
import { boms } from './boms';
import { materials } from '../materials/materials';
import { users } from '../identity-access/users';

/**
 * Vật tư as-used của một BOM — cùng khuôn `routing_steps`: một dòng thuộc **hoặc** thẳng Cấp 0 của
 * sản phẩm (`bomItemId` null) **hoặc** một node cụ thể trong cây (`bomItemId` có giá trị). Khác
 * `routing_steps`, `bomId` luôn tường minh (không suy ra được qua join khi `bomItemId` null).
 *
 * Rules:
 * - `materialId` bất biến sau khi thêm — đổi vật tư là xoá dòng rồi thêm lại, cùng quy ước
 *   `routing_steps.operationId`.
 * - Không unique trên `(bomId, bomItemId, materialId)` — cùng vật tư được phép khai hai dòng khác
 *   nhau (khác `note`), giống việc `bom_items` không chống trùng sibling.
 * - Vật tư Cấp 0 của một WIP **không** tự cộng vào dòng vật tư as-used của node tham chiếu WIP đó
 *   trong cây cha — hai danh sách độc lập, xem `docs/domains/product-structure.md`.
 */
export const bomItemMaterials = pgTable(
  'bom_item_materials',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    bomId: uuid('bom_id')
      .notNull()
      .references(() => boms.id, { onDelete: 'cascade' }),
    // Null = vật tư của Cấp 0 (chính sản phẩm gốc, không phải một dòng bom_items).
    bomItemId: uuid('bom_item_id').references(() => bomItems.id, {
      onDelete: 'cascade',
    }),
    // restrict: một vật tư đang được BOM tham chiếu không thể bị xoá cứng ra khỏi dưới chân nó.
    materialId: uuid('material_id')
      .notNull()
      .references(() => materials.id, { onDelete: 'restrict' }),
    quantity: numeric('quantity', {
      precision: 12,
      scale: 3,
      mode: 'number',
    }).notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
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
    index('idx_bom_item_materials_bom_id').on(table.bomId),
    index('idx_bom_item_materials_bom_item_id').on(table.bomItemId),
    index('idx_bom_item_materials_material_id').on(table.materialId),
    index('idx_bom_item_materials_created_by').on(table.createdBy),
    check('chk_bom_item_materials_quantity_positive', sql`quantity > 0`),
  ],
);

export const bomItemMaterialsRelations = relations(
  bomItemMaterials,
  ({ one }) => ({
    bom: one(boms, {
      fields: [bomItemMaterials.bomId],
      references: [boms.id],
    }),
    bomItem: one(bomItems, {
      fields: [bomItemMaterials.bomItemId],
      references: [bomItems.id],
    }),
    material: one(materials, {
      fields: [bomItemMaterials.materialId],
      references: [materials.id],
    }),
    creator: one(users, {
      fields: [bomItemMaterials.createdBy],
      references: [users.id],
    }),
  }),
);
