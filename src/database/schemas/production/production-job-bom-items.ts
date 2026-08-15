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

import { itemTypeEnum, items } from '../items/items';
import { productionJobOperations } from './production-job-operations';
import { productionJobs } from './production-jobs';

/**
 * Snapshot cây BOM của một Job — nhân bản `bom_items` (cả node WIP lẫn lá RM) trong transaction
 * duyệt LSX (`ProductionJobsService.createJobs`), id hoàn toàn mới. Đóng băng, không có route sửa —
 * sửa/xoá BOM gốc sau đó không ảnh hưởng Job đã duyệt.
 *
 * Rules:
 * - `code`/`name` là **snapshot text**, nguồn hiển thị chính — KHÔNG đọc qua `itemId` lúc render.
 *   `itemId` chỉ còn là liên kết tham khảo tới item gốc (`set null` khi bị xoá), không phải nguồn
 *   dữ liệu.
 * - `itemType` chỉ nhận `WIP`/`RM` (không có `FG` trong cây snapshot) — dùng chung enum `ItemType`
 *   với `items.type` thay vì một enum riêng.
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
    itemType: itemTypeEnum('item_type').notNull(),
    code: varchar('code', { length: 50 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    quantity: numeric('quantity', {
      precision: 12,
      scale: 3,
      mode: 'number',
    }).notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    level: integer('level').notNull().default(1),
    itemId: uuid('item_id').references(() => items.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_production_job_bom_items_production_job_id').on(
      table.productionJobId,
    ),
    index('idx_production_job_bom_items_parent_id').on(table.parentId),
    index('idx_production_job_bom_items_item_id').on(table.itemId),
    check(
      'chk_production_job_bom_items_item_type_leaf',
      sql`item_type IN ('WIP', 'RM')`,
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

export type ProductionJobBomItemSelect =
  typeof productionJobBomItems.$inferSelect;
