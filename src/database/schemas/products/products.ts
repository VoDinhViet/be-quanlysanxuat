import { relations } from 'drizzle-orm';
import { pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';

import { clients } from '../clients';
import { bomLines } from './bom-lines';
import { jobOperations } from '../job-operations';
import { productFiles } from './product-files';
import { productRevisions } from './product-revisions';
import { routingSteps } from './routing-steps';
import { units } from './units';

export enum ProductItemType {
  Fg = 'fg',
  Wip = 'wip',
  Rm = 'rm',
  Consumable = 'consumable',
}

export enum ProductStatus {
  Active = 'active',
  Inactive = 'inactive',
  Locked = 'locked',
}

export const productItemTypeEnum = pgEnum('product_item_type', [
  ProductItemType.Fg,
  ProductItemType.Wip,
  ProductItemType.Rm,
  ProductItemType.Consumable,
]);

export const productStatusEnum = pgEnum('product_status', [
  ProductStatus.Active,
  ProductStatus.Inactive,
  ProductStatus.Locked,
]);

export const products = pgTable(
  'products',
  {
    // ID sản phẩm.
    id: uuid('id').defaultRandom().primaryKey(),
    // Khách hàng sở hữu/đặt hàng sản phẩm.
    clientId: uuid('client_id').references(() => clients.id, { onDelete: 'set null' }),
    // Mã SP / mã VT / part ID.
    code: varchar('code', { length: 50 }).notNull(),
    // Tên sản phẩm.
    name: varchar('name', { length: 255 }).notNull(),
    // Loại item.
    itemType: productItemTypeEnum('item_type').notNull().default(ProductItemType.Fg),
    // Đơn vị tính.
    unitId: uuid('unit_id')
      .notNull()
      .references(() => units.id, { onDelete: 'restrict' }),
    // Hình ảnh.
    imageUrl: text('image_url'),
    // Trạng thái.
    status: productStatusEnum('status').notNull().default(ProductStatus.Active),
    // Ghi chú.
    note: text('note'),
    // Thời gian tạo.
    createdAt: timestamp('created_at').defaultNow().notNull(),
    // Thời gian cập nhật.
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    // Thời gian xóa mềm.
    deletedAt: timestamp('deleted_at'),
  },
  (table) => [uniqueIndex('products_code_unique_idx').on(table.code)],
);

export const productsRelations = relations(products, ({ one, many }) => ({
  client: one(clients, {
    fields: [products.clientId],
    references: [clients.id],
  }),
  unit: one(units, {
    fields: [products.unitId],
    references: [units.id],
  }),
  files: many(productFiles),
  revisions: many(productRevisions),
  // products 1-n bom_lines as parent_item.
  parentBomLines: many(bomLines, { relationName: 'parentItem' }),
  // products 1-n bom_lines as child_item.
  childBomLines: many(bomLines, { relationName: 'childItem' }),
  // products 1-n routing_steps as item.
  routingSteps: many(routingSteps),
  // products 1-n job_operations as item.
  jobOperations: many(jobOperations),
}));

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
