import { relations, sql } from 'drizzle-orm';
import {
  check,
  index,
  numeric,
  pgTable,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { files } from '../files';
import { items } from '../items/items';
import { productionJobs } from './production-jobs';

/**
 * Danh sách vật tư của một Job — khởi tạo bằng cách gộp BOM theo vật tư (cùng phép `SUM` của
 * `GET /items/:id/materials`, không nổ theo cấp) nhân với SL Job, trong transaction duyệt LSX.
 * Hiện là **read-only** (`GET /production-jobs/:jobId/materials`) — chưa có route sửa, tạm
 * hoãn; dự kiến mở rộng sang CRUD từng dòng sau này. Xem `docs/domains/production.md`.
 *
 * Rules:
 * - `unitQty` là định mức BOM lúc duyệt, **bất biến**. NULL để sẵn chỗ cho lúc có CRUD — dòng
 *   người dùng thêm tay (ngoài BOM) sẽ không có định mức gốc.
 * - `materialCode`/`materialName`/`unitCode`/`unitName` là **snapshot text**, nguồn hiển thị chính —
 *   đóng băng lúc duyệt, độc lập với `items`/`units` sống. `itemId` chỉ còn là liên kết tham khảo
 *   (`set null` khi bị xoá). `imageFileId` copy thẳng ảnh vật tư lúc duyệt — `files` là registry
 *   ghi-một-lần (không có route sửa) nên an toàn giữ dạng liên kết sống, khác `items`/`units`.
 * - Unique `(productionJobId, itemId)` — khác `productionJobOperations`, nguồn đã gộp sẵn theo vật
 *   tư nên một vật tư chỉ có đúng một dòng cho mỗi Job.
 * - Không `updatedAt` — append-only lúc sinh, chưa có route ghi nào khác.
 */
export const productionJobMaterials = pgTable(
  'production_job_materials',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    productionJobId: uuid('production_job_id')
      .notNull()
      .references(() => productionJobs.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id').references(() => items.id, {
      onDelete: 'set null',
    }),
    materialCode: varchar('material_code', { length: 50 }).notNull(),
    materialName: varchar('material_name', { length: 255 }).notNull(),
    unitCode: varchar('unit_code', { length: 50 }).notNull(),
    unitName: varchar('unit_name', { length: 255 }).notNull(),
    imageFileId: uuid('image_file_id').references(() => files.id, {
      onDelete: 'set null',
    }),
    unitQty: numeric('unit_qty', { precision: 18, scale: 3, mode: 'number' }),
    requiredQty: numeric('required_qty', {
      precision: 18,
      scale: 3,
      mode: 'number',
    }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    unique('uq_production_job_materials_job_item').on(
      table.productionJobId,
      table.itemId,
    ),
    index('idx_production_job_materials_item_id').on(table.itemId),
    index('idx_production_job_materials_image_file_id').on(table.imageFileId),
    check(
      'chk_production_job_materials_qty',
      sql`(unit_qty IS NULL OR unit_qty > 0) AND required_qty > 0`,
    ),
  ],
);

export const productionJobMaterialsRelations = relations(
  productionJobMaterials,
  ({ one }) => ({
    productionJob: one(productionJobs, {
      fields: [productionJobMaterials.productionJobId],
      references: [productionJobs.id],
    }),
    item: one(items, {
      fields: [productionJobMaterials.itemId],
      references: [items.id],
    }),
  }),
);
