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
import { materials } from '../materials/materials';
import { users } from '../identity-access/users';

/**
 * Vật tư as-used gắn thẳng vào một node `bom_items` cụ thể — cùng khuôn `routing_steps`, nhưng
 * không còn khái niệm "Cấp 0" (khai thẳng vào sản phẩm gốc, không qua node nào): mọi dòng bắt buộc
 * có `bomItemId`.
 *
 * Rules:
 * - `materialId` bất biến sau khi thêm — đổi vật tư là xoá dòng rồi thêm lại, cùng quy ước
 *   `routing_steps.operationId`.
 * - Không unique trên `(bomItemId, materialId)` — cùng vật tư được phép khai hai dòng khác nhau
 *   (khác `note`), giống việc `bom_items` không chống trùng sibling.
 */
export const bomMaterials = pgTable(
  'bom_materials',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    bomItemId: uuid('bom_item_id')
      .notNull()
      .references(() => bomItems.id, { onDelete: 'cascade' }),
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
    index('idx_bom_materials_bom_item_id').on(table.bomItemId),
    index('idx_bom_materials_material_id').on(table.materialId),
    index('idx_bom_materials_created_by').on(table.createdBy),
    check('chk_bom_materials_quantity_positive', sql`quantity > 0`),
  ],
);

export const bomMaterialsRelations = relations(bomMaterials, ({ one }) => ({
  bomItem: one(bomItems, {
    fields: [bomMaterials.bomItemId],
    references: [bomItems.id],
  }),
  material: one(materials, {
    fields: [bomMaterials.materialId],
    references: [materials.id],
  }),
  creator: one(users, {
    fields: [bomMaterials.createdBy],
    references: [users.id],
  }),
}));
