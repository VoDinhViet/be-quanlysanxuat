import { relations } from 'drizzle-orm';
import { pgTable, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core';

import { items } from '../items/items';

/**
 * Snapshot **mã/tên vật tư** đóng băng lúc duyệt LSX — bảng chiều dùng chung cho mọi
 * `production_job_issues` của mọi Job, mọi LSX. Ghi duy nhất qua
 * `ProductionJobsService.copyBomIssues` (get-or-create trong transaction duyệt LSX).
 *
 * Rules:
 * - Khoá định danh là **bộ ba nội dung** `(itemId, code, name)`, không phải riêng `itemId` — kiểu
 *   SCD type-2: master data không đổi thì mọi Job dùng chung MỘT dòng; `items` đổi mã/tên thì lần
 *   duyệt sau sinh dòng MỚI, Job cũ vẫn trỏ dòng cũ (đóng băng lúc duyệt vẫn giữ nguyên). Cả ba
 *   cột `NOT NULL` — một cột NULL trong UNIQUE bị Postgres coi là "distinct", phá cả phép gộp
 *   trùng lẫn `ON CONFLICT`.
 * - **Bất biến sau khi ghi.** Không route sửa, không `updatedAt` — một dòng có thể đang được nhiều
 *   Job ở nhiều LSX dùng chung, `UPDATE` một dòng là viết lại lịch sử của tất cả. Đổi nội dung =
 *   chèn dòng mới, không bao giờ sửa dòng cũ.
 * - `itemId` là `restrict` chứ không `set null` (khác `productionJobIssues.itemId`) — ở đây nó là
 *   một phần khoá định danh cần `NOT NULL`, không phải liên kết tham khảo. `items` không có route
 *   xoá cứng nên `restrict` không chặn thao tác thật nào.
 * - Không index riêng cho `itemId` — cột dẫn đầu của `uq_production_job_items_item_code_name` đã
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
