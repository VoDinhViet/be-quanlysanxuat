import { pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

/** Nhóm vật tư do người dùng tự quản (vật tư mài, vật tư hàn, bulong, thép...) — chỉ để phân loại
 * và thống kê, gắn tuỳ chọn vào `items.itemCategoryId`. */
export const itemCategories = pgTable('item_categories', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: varchar('code', { length: 50 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  description: varchar('description', { length: 500 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export type ItemCategorySelect = typeof itemCategories.$inferSelect;
