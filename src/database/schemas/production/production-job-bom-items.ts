import { relations, sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  check,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { files } from '../files';
import { items } from '../items/items';
import { productionJobOperations } from './production-job-operations';
import { productionJobs } from './production-jobs';

/**
 * `FG` — node "Cấp 0" đại diện chính thành phẩm (đúng 1 mỗi Job); `COMPONENT`/`DIRECT` — nhân bản
 * từ `bom_items.type`. Enum riêng, không dùng `ItemType`: `items.type` không có giá trị cho node
 * cấu trúc con.
 */
export enum ProductionJobBomItemType {
  FG = 'FG',
  COMPONENT = 'COMPONENT',
  DIRECT = 'DIRECT',
}

export const productionJobBomItemTypeEnum = pgEnum(
  'production_job_bom_item_type',
  [
    ProductionJobBomItemType.FG,
    ProductionJobBomItemType.COMPONENT,
    ProductionJobBomItemType.DIRECT,
  ],
);

/**
 * Snapshot cây BOM của một Job — nhân bản `bom_items` (node `COMPONENT` lẫn lá `DIRECT`) với id
 * mới, dựng một lần lúc tạo Job (`createJobs` → `createJobSnapshot`) hoặc chụp lại khi Job còn
 * `PENDING` (`reloadSnapshot`). Không có route sửa; sửa/xoá BOM gốc sau đó không ảnh hưởng Job.
 *
 * Rules:
 * - `code`/`name` là **snapshot text**, nguồn hiển thị chính — không đọc qua `itemId` lúc render.
 *   `itemId` chỉ là liên kết tham khảo tới item gốc (`set null` khi bị xoá) và luôn NULL với node
 *   `COMPONENT` (node đó không phải một item).
 * - Mỗi Job có **đúng một** node `FG` (nếu BOM của FG có `routing_operations`): node "Cấp 0" mang
 *   routing lắp ráp/đóng gói của thành phẩm. Luôn `parentId = null`, `quantity = 1`,
 *   `plannedQuantity = job.quantity`, `sortOrder` lớn nhất trong Job (đứng cuối bảng "Công đoạn
 *   sản xuất").
 * - `level` copy từ `bom_items.level` (quy ước 1-based); node `FG` dùng `0`, ngoài quy ước có chủ ý.
 * - `plannedQuantity` là giá trị **dẫn xuất** (nhân luỹ kế `quantity` theo cây × SL Job), tính một
 *   lần lúc dựng snapshot rồi đóng băng. Không có CHECK `> 0` vì định mức lẻ nhiều cấp có thể tròn
 *   về 0 ở scale 6.
 * - `imageFileId` copy ảnh item lúc dựng, cùng lý lẽ `productionJobIssues.imageFileId`: `files` là
 *   registry ghi-một-lần nên giữ liên kết sống (`set null` khi bị xoá) là an toàn, khác
 *   `itemId`/`code`/`name` phải đóng băng.
 * - Không `updatedAt`: append-only, tiến độ sửa được nằm ở `production_job_operations`.
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
    itemType: productionJobBomItemTypeEnum('item_type').notNull(),
    code: varchar('code', { length: 50 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    quantity: numeric('quantity', {
      precision: 12,
      scale: 6,
      mode: 'number',
    }).notNull(),
    plannedQuantity: numeric('planned_quantity', {
      precision: 18,
      scale: 6,
      mode: 'number',
    }).notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    level: integer('level').notNull().default(1),
    itemId: uuid('item_id').references(() => items.id, {
      onDelete: 'set null',
    }),
    imageFileId: uuid('image_file_id').references(() => files.id, {
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
    index('idx_production_job_bom_items_image_file_id').on(table.imageFileId),
    check(
      'chk_production_job_bom_items_item_type',
      sql`item_type IN ('FG', 'COMPONENT', 'DIRECT')`,
    ),
    check('chk_production_job_bom_items_quantity_positive', sql`quantity > 0`),
    // Mỗi Job nhiều nhất một node Cấp 0 (FG) — cắm routing lắp ráp/đóng gói của thành phẩm.
    // Literal 'FG' (không interpolate enum): predicate của partial index không được là bound
    // parameter, `drizzle-kit generate` sẽ sinh `$1` không hợp lệ trong DDL.
    uniqueIndex('uq_production_job_bom_items_final_assembly')
      .on(table.productionJobId)
      .where(sql`item_type = 'FG'`),
  ],
);

export const productionJobBomItemsRelations = relations(
  productionJobBomItems,
  ({ one, many }) => ({
    productionJob: one(productionJobs, {
      fields: [productionJobBomItems.productionJobId],
      references: [productionJobs.id],
    }),
    imageFile: one(files, {
      fields: [productionJobBomItems.imageFileId],
      references: [files.id],
    }),
    operations: many(productionJobOperations),
  }),
);

export type ProductionJobBomItemSelect =
  typeof productionJobBomItems.$inferSelect;
