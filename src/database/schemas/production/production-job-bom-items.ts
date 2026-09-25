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
 * `FG` — node "Cấp 0" đại diện chính thành phẩm (đúng 1 mỗi Job); `COMPONENT`/`DIRECT` — nhân
 * bản từ `bom_items.type` (`docs/decisions/wip-removal.md`). Enum riêng, không dùng chung
 * `ItemType`: `items.type` không còn giá trị nào cho node cấu trúc con.
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
 * Snapshot cây BOM của một Job — nhân bản `bom_items` (cả node COMPONENT lẫn lá DIRECT), id
 * hoàn toàn mới. Dựng đúng một lần trong transaction `start` (`ProductionJobsService.startJob` →
 * `createJobSnapshot`) — Job còn `PENDING` không có dòng nào ở đây, xem
 * `docs/decisions/job-snapshot-at-start.md`. Đóng băng ngay từ lúc đó, không có route sửa — sửa/xoá
 * BOM gốc sau đó không ảnh hưởng Job đã `start`.
 *
 * Rules:
 * - `code`/`name` là **snapshot text**, nguồn hiển thị chính — KHÔNG đọc qua `itemId` lúc render.
 *   `itemId` chỉ còn là liên kết tham khảo tới item gốc (`set null` khi bị xoá), không phải nguồn
 *   dữ liệu — và luôn NULL với node `COMPONENT` (node đó không phải một item).
 * - `itemType` chủ yếu `COMPONENT`/`DIRECT` (nhân bản từ `bom_items`), cộng **đúng một** node
 *   `FG` mỗi Job —
 *   node "Cấp 0" đại diện chính thành phẩm, mang routing lắp ráp/đóng gói của FG
 *   (`createJobBomItems`, xem `docs/decisions/oqc-per-operation.md` mục "Đừng hoàn
 *   lại"). Node FG luôn `parentId = null`, `sortOrder` lớn nhất trong Job (đứng cuối bảng "Công
 *   đoạn sản xuất") — snapshot riêng của Job này, không lẫn với node ROOT thật của `bom_items`
 *   (`docs/decisions/root-bom-item.md`, cây gốc đã có `parentId` cho mọi node khác ROOT nên không
 *   còn node nào khác trùng `parentId = null` để phân biệt); chỉ tạo khi node ROOT của FG có
 *   `bom_operations` (routing Cấp 0).
 * - `level` là snapshot copy nguyên từ `bom_items.level` lúc duyệt LSX, cùng quy ước 1-based (node
 *   FG dùng `0`, ngoài quy ước này có chủ ý — không phải một cấp của cây con) — cây Job nhỏ, dựng
 *   trong bộ nhớ lúc đọc qua `parentId` (`ProductionJobsService`, mirror `BomsService`), không cần
 *   cột path riêng.
 * - `plannedQuantity` là giá trị **dẫn xuất** (nhân luỹ kế `quantity` theo cây × SL Job), tính một
 *   lần cùng lúc `createJobBomItems` và đóng băng — không có CHECK `> 0` vì định mức lẻ nhiều cấp có thể
 *   tròn về 0 ở scale 3. Node FG dùng thẳng `quantity = 1`, `plannedQuantity = job.quantity`.
 * - `imageFileId` copy thẳng ảnh item lúc duyệt, cùng lý lẽ `productionJobIssues.imageFileId` —
 *   `files` là registry ghi-một-lần nên giữ dạng liên kết sống (`set null` khi bị xoá) là an toàn,
 *   khác `itemId`/`code`/`name` vốn phải đóng băng.
 * - Không `updatedAt` — append-only lúc `createJobBomItems` sinh cây, chưa có route ghi nào khác (kể cả
 *   `completedQuantity`/`completedDate` sửa được đều nằm trên `production_job_operations`, không
 *   phải bảng này).
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
      scale: 3,
      mode: 'number',
    }).notNull(),
    plannedQuantity: numeric('planned_quantity', {
      precision: 18,
      scale: 3,
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
    // Literal 'FG' (không interpolate `${ProductionJobBomItemType.FG}`) — một partial index
    // predicate không được là bound parameter, `drizzle-kit generate` sẽ sinh ra `$1` không hợp lệ
    // trong DDL đứng một mình (khác `uq_items_code_revision_active` không dính vấn đề này vì vế nó
    // không có biến).
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
