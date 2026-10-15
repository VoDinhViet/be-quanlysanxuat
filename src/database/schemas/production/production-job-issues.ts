import { relations, sql } from 'drizzle-orm';
import {
  check,
  index,
  numeric,
  pgTable,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { files } from '../files';
import { items } from '../items/items';
import { productionJobItems } from './production-job-items';
import { productionJobs } from './production-jobs';
import { productionJobUnits } from './production-job-units';

/**
 * Danh sách vật tư của một Job — gộp `production_job_bom_items.plannedQuantity` (đã nổ cấp) theo
 * vật tư, dựng lúc tạo Job (`createJobs` → `createJobSnapshot`) và chụp lại được khi còn `PENDING`
 * (`reloadSnapshot`). Job `PENDING` còn sửa tay thêm/sửa/xoá dòng (`production-job-issues.query.ts`,
 * đóng dấu `production_jobs.snapshotEditedAt`); từ `IN_PROGRESS` khoá hẳn. Sau snapshot đây là
 * nguồn duy nhất cho nhu cầu vật tư (`startJob` tính thiếu, `bomDemand` của Inventory/Purchase
 * Requests, phiếu lãnh, `GET /production-jobs/:jobId/bom`); cây `production_job_bom_items` có thể
 * lệch với bảng này sau khi sửa tay. Xem `docs/CODEMAPS/production.md`,
 * `docs/CODEMAPS/product-structure.md`.
 *
 * Rules:
 * - `unitQty` là định mức BOM lúc dựng snapshot, **bất biến**; NULL cho dòng người dùng thêm tay
 *   (ngoài BOM).
 * - Mã/tên vật tư và ĐVT không nằm trên dòng này mà ở hai bảng chiều dùng chung
 *   `productionJobItems`/`productionJobUnits` (SCD type-2). Hai FK **song song** (hai bảng chiều
 *   không tham chiếu nhau): đổi tên vật tư chỉ sinh dòng mới ở bảng vật tư, đổi tên ĐVT chỉ sinh
 *   dòng mới ở bảng ĐVT. Cả hai `NOT NULL` + `restrict`: dòng chiều đang được tham chiếu không
 *   được xoá hay `UPDATE`.
 * - `itemId` là liên kết tham khảo tới item **sống** (`set null` khi bị xoá), cố ý khác
 *   `productionJobItems.itemId` (`restrict`, là một phần khoá định danh). `getShortageItems` đọc
 *   cột này và bỏ qua dòng NULL.
 * - `imageFileId` copy ảnh vật tư lúc dựng và **ở lại dòng này**, không lên bảng chiều: ảnh không
 *   nằm trong khoá bộ ba, đưa lên đó sẽ vô định khi hai Job cùng bộ ba mà khác ảnh.
 * - Unique `(productionJobId, itemId)` theo item **sống**, không theo `productionJobItemId`: hai
 *   dòng chiều khác nhau của cùng một item (hai phiên bản tên) lọt qua khoá kia, không lọt qua khoá
 *   này. `itemId` nullable nên về lý thuyết unique mất hiệu lực nếu ≥ 2 dòng bị `set null` (NULL là
 *   distinct); chấp nhận được vì `items` không có route hard-delete (chỉ soft-delete), nhánh
 *   `set null` thực tế không chạy.
 * - Không `updatedAt`: sửa số lượng ghi vết ở `production_job_logs` (`ITEMS_EDITED`).
 */
export const productionJobIssues = pgTable(
  'production_job_issues',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    productionJobId: uuid('production_job_id')
      .notNull()
      .references(() => productionJobs.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id').references(() => items.id, {
      onDelete: 'set null',
    }),
    productionJobItemId: uuid('production_job_item_id')
      .notNull()
      .references(() => productionJobItems.id, { onDelete: 'restrict' }),
    productionJobUnitId: uuid('production_job_unit_id')
      .notNull()
      .references(() => productionJobUnits.id, { onDelete: 'restrict' }),
    imageFileId: uuid('image_file_id').references(() => files.id, {
      onDelete: 'set null',
    }),
    unitQty: numeric('unit_qty', { precision: 18, scale: 6, mode: 'number' }),
    requiredQty: numeric('required_qty', {
      precision: 18,
      scale: 6,
      mode: 'number',
    }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    unique('uq_production_job_issues_job_item').on(
      table.productionJobId,
      table.itemId,
    ),
    index('idx_production_job_issues_item_id').on(table.itemId),
    index('idx_production_job_issues_production_job_item_id').on(
      table.productionJobItemId,
    ),
    index('idx_production_job_issues_production_job_unit_id').on(
      table.productionJobUnitId,
    ),
    index('idx_production_job_issues_image_file_id').on(table.imageFileId),
    check(
      'chk_production_job_issues_qty',
      sql`(unit_qty IS NULL OR unit_qty > 0) AND required_qty > 0`,
    ),
  ],
);

export const productionJobIssuesRelations = relations(
  productionJobIssues,
  ({ one }) => ({
    productionJob: one(productionJobs, {
      fields: [productionJobIssues.productionJobId],
      references: [productionJobs.id],
    }),
    item: one(items, {
      fields: [productionJobIssues.itemId],
      references: [items.id],
    }),
    jobItem: one(productionJobItems, {
      fields: [productionJobIssues.productionJobItemId],
      references: [productionJobItems.id],
    }),
    jobUnit: one(productionJobUnits, {
      fields: [productionJobIssues.productionJobUnitId],
      references: [productionJobUnits.id],
    }),
  }),
);

export type ProductionJobIssueSelect = typeof productionJobIssues.$inferSelect;
