import { relations, sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  check,
  index,
  integer,
  numeric,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { bomItemTypeEnum } from '../products/bom-items';
import { materials } from '../materials/materials';
import { products } from '../products/products';
import { productionJobOperations } from './production-job-operations';
import { productionJobs } from './production-jobs';

/**
 * Snapshot cây BOM của một Job — nhân bản `bom_items` (cả `PRODUCT` lẫn `MATERIAL`) trong transaction
 * duyệt LSX (`ProductionJobsService.createJobs`), id hoàn toàn mới. Đóng băng, không có route sửa —
 * sửa/xoá BOM gốc sau đó không ảnh hưởng Job đã duyệt.
 *
 * Rules:
 * - `code`/`name` là **snapshot text**, nguồn hiển thị chính — KHÔNG đọc qua `productId`/
 *   `materialId` lúc render. `productId`/`materialId` chỉ còn là liên kết tham khảo tới sản
 *   phẩm/vật tư gốc (`set null` khi bị xoá), không phải nguồn dữ liệu.
 * - `level` là snapshot copy nguyên từ `bom_items.level` lúc duyệt LSX, cùng quy ước 1-based — cây
 *   Job nhỏ, dựng trong bộ nhớ lúc đọc qua `parentId` (`ProductionJobsService`, mirror
 *   `BomsService`), không cần cột path riêng.
 */
export const productionJobBomItems = pgTable(
  'production_job_bom_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    productionJobId: uuid('production_job_id')
      .notNull()
      .references(() => productionJobs.id, { onDelete: 'cascade' }),
    parentId: uuid('parent_id').references(
      (): AnyPgColumn => productionJobBomItems.id,
      { onDelete: 'cascade' },
    ),
    itemType: bomItemTypeEnum('item_type').notNull(),
    code: varchar('code', { length: 50 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    quantity: numeric('quantity', {
      precision: 12,
      scale: 3,
      mode: 'number',
    }).notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    level: integer('level').notNull().default(1),
    productId: uuid('product_id').references(() => products.id, {
      onDelete: 'set null',
    }),
    materialId: uuid('material_id').references(() => materials.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_production_job_bom_items_production_job_id').on(
      table.productionJobId,
    ),
    index('idx_production_job_bom_items_parent_id').on(table.parentId),
    index('idx_production_job_bom_items_product_id').on(table.productId),
    index('idx_production_job_bom_items_material_id').on(table.materialId),
    check(
      'chk_production_job_bom_items_item_type_target',
      sql`(item_type = 'PRODUCT' AND product_id IS NOT NULL AND material_id IS NULL) OR (item_type = 'MATERIAL' AND material_id IS NOT NULL AND product_id IS NULL)`,
    ),
    check('chk_production_job_bom_items_quantity_positive', sql`quantity > 0`),
  ],
);

export const productionJobBomItemsRelations = relations(
  productionJobBomItems,
  ({ one, many }) => ({
    productionJob: one(productionJobs, {
      fields: [productionJobBomItems.productionJobId],
      references: [productionJobs.id],
    }),
    operations: many(productionJobOperations),
  }),
);
