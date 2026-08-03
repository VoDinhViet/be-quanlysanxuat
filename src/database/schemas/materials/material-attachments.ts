import { relations } from 'drizzle-orm';
import { index, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';

import { files } from '../files';
import { materials } from './materials';

/**
 * 1-many with materials: the "images & documents" tab. Each row is a link to a `files` registry
 * row, never a bare URL. Replace-all on update.
 */
export const materialAttachments = pgTable(
  'material_attachments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    materialId: uuid('material_id')
      .notNull()
      .references(() => materials.id, { onDelete: 'cascade' }),
    fileId: uuid('file_id')
      .notNull()
      .references(() => files.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_material_attachments_material_id').on(table.materialId),
    index('idx_material_attachments_file_id').on(table.fileId),
  ],
);

export const materialAttachmentsRelations = relations(
  materialAttachments,
  ({ one }) => ({
    material: one(materials, {
      fields: [materialAttachments.materialId],
      references: [materials.id],
    }),
    file: one(files, {
      fields: [materialAttachments.fileId],
      references: [files.id],
    }),
  }),
);
