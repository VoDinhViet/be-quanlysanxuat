import { relations } from 'drizzle-orm';
import { pgTable, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core';

import { items } from '../items/items';

/**
 * Snapshot **mã/tên vật tư** đóng băng lúc dựng snapshot Job — bảng chiều dùng chung cho mọi
 * `production_job_issues` của mọi Job, mọi LSX. Ghi qua `getOrCreateJobItemIds`
 * (`production-job-snapshot.query.ts`): get-or-create trong transaction tạo Job hoặc thêm vật tư
 * tay.
 *
 * Rules:
 * - Khoá định danh là **bộ ba** `(itemId, code, name)`, không phải riêng `itemId` (kiểu SCD type-2):
 *   master data không đổi thì mọi Job dùng chung MỘT dòng; `items` đổi mã/tên thì lần dựng sau sinh
 *   dòng MỚI, Job cũ vẫn trỏ dòng cũ. Cả ba cột `NOT NULL` vì NULL trong UNIQUE bị Postgres coi là
 *   "distinct", phá cả phép gộp trùng lẫn `ON CONFLICT`.
 * - **Bất biến sau khi ghi**, không route sửa, không `updatedAt`: một dòng có thể được nhiều Job ở
 *   nhiều LSX dùng chung, `UPDATE` là viết lại lịch sử của tất cả. Đổi nội dung = chèn dòng mới.
 * - `itemId` là `restrict` chứ không `set null` (khác `productionJobIssues.itemId`) vì là một phần
 *   khoá định danh cần `NOT NULL`. `items` không có route xoá cứng nên `restrict` không chặn thao
 *   tác thật nào.
 * - Không index riêng cho `itemId`: cột dẫn đầu của `uq_production_job_items_item_code_name` đã
 *   phục vụ mọi lượt tra `WHERE item_id IN (...)`.
 */
export const productionJobItems = pgTable(
  'production_job_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'restrict' }),
    code: varchar('code', { length: 50 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    unique('uq_production_job_items_item_code_name').on(
      table.itemId,
      table.code,
      table.name,
    ),
  ],
);

export const productionJobItemsRelations = relations(
  productionJobItems,
  ({ one }) => ({
    item: one(items, {
      fields: [productionJobItems.itemId],
      references: [items.id],
    }),
  }),
);

export type ProductionJobItemSelect = typeof productionJobItems.$inferSelect;
