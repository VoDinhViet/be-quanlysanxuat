import { relations } from 'drizzle-orm';
import { index, pgTable, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import { files } from '../files';
import { items } from './items';

/**
 * Join table onto the `files` registry, same shape as `supplier_files`/`order_files`. It
 * deliberately stores nothing but the link: url/filename/mimetype/size live on `files`, so
 * attachments get magic-byte validation and orphan sweeping for free instead of being a second,
 * weaker file registry. No `updatedAt` — a link row is only ever inserted or deleted, never
 * mutated.
 */
export const itemFiles = pgTable(
  'item_files',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    fileId: uuid('file_id')
      .notNull()
      .references(() => files.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_item_files_item_id').on(table.itemId),
    index('idx_item_files_file_id').on(table.fileId),
    unique('uq_item_files_item_file').on(table.itemId, table.fileId),
  ],
);

export const itemFilesRelations = relations(itemFiles, ({ one }) => ({
  item: one(items, {
    fields: [itemFiles.itemId],
    references: [items.id],
  }),
  file: one(files, {
    fields: [itemFiles.fileId],
    references: [files.id],
  }),
}));

export type ItemFileSelect = typeof itemFiles.$inferSelect;
