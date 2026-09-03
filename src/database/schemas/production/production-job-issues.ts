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
 * Danh sách vật tư của một Job — khởi tạo bằng cách gộp `production_job_bom_items.plannedQuantity`
 * (đã nổ cấp) theo vật tư, trong transaction duyệt LSX, sau `copyBomTree`. Không expose route ghi
 * nào — chỉ còn là nguồn nội bộ: `startJob` (vật tư thiếu), `bomDemand` của Inventory/Purchase
 * Requests, và `GET /production-jobs/:jobId/bom`. Xem `docs/domains/production.md`,
 * "Chuẩn nổ cấp BOM" ở `docs/domains/product-structure.md`.
 *
 * Rules:
 * - `unitQty` là định mức BOM lúc duyệt, **bất biến**. NULL để sẵn chỗ cho lúc có CRUD — dòng
 *   người dùng thêm tay (ngoài BOM) sẽ không có định mức gốc.
 * - Mã/tên vật tư và mã/tên ĐVT **không nằm trên dòng này** — tách sang hai bảng chiều dùng chung
 *   `productionJobItems`/`productionJobUnits` (SCD type-2, khoá theo bộ ba nội dung, xem doc
 *   comment hai bảng đó). Hai FK **song song**, hai bảng chiều không tham chiếu nhau: đổi tên vật
 *   tư chỉ sinh dòng mới bên `productionJobItems`, đổi tên ĐVT chỉ sinh dòng mới bên
 *   `productionJobUnits`. Cả hai `NOT NULL` + `restrict` — dòng chiều đang được dòng này (và có
 *   thể nhiều Job khác) trỏ tới, không được xoá, và tuyệt đối không được `UPDATE`.
 * - `itemId` vẫn là liên kết tham khảo tới item **sống** (`set null` khi bị xoá) — cố ý khác
 *   `productionJobItems.itemId` (`restrict`): ở đây nó là liên kết, ở kia nó là một phần khoá định
 *   danh. `collectJobIssueShortages`/`jobIssueDemandSubquery` đọc cột này, tự bỏ qua dòng NULL.
 * - `imageFileId` copy thẳng ảnh vật tư lúc duyệt và **ở lại dòng này**, không lên bảng chiều — ảnh
 *   không nằm trong khoá bộ ba, đưa lên đó sẽ vô định khi hai Job cùng bộ ba mà khác ảnh. `files`
 *   là registry ghi-một-lần nên an toàn giữ dạng liên kết sống.
 * - Unique `(productionJobId, itemId)` giữ theo item **sống**, không theo `productionJobItemId` —
 *   hai dòng chiều khác nhau của cùng một item (hai phiên bản tên) sẽ lọt qua khoá kia, không lọt
 *   qua khoá này. "Một vật tư đúng một dòng cho mỗi Job". `itemId` nullable (`set null`) về lý
 *   thuyết làm unique mất hiệu lực nếu có ≥ 2 dòng cùng item bị NULL hoá (Postgres coi NULL là
 *   distinct) — chấp nhận được vì `items` **không có route hard-delete** (chỉ soft-delete qua
 *   `deletedAt`), nên nhánh `set null` trên thực tế không bao giờ chạy.
 * - Không `updatedAt` — append-only lúc sinh, chưa có route ghi nào khác.
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
    unitQty: numeric('unit_qty', { precision: 18, scale: 3, mode: 'number' }),
    requiredQty: numeric('required_qty', {
      precision: 18,
      scale: 3,
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
