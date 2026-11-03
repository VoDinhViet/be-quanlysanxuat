import { sql } from 'drizzle-orm';
import {
  check,
  integer,
  pgTable,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

/**
 * Không còn được đọc hay ghi: `generateDocumentSequence(s)` (`src/common/utils/document-sequence.ts`)
 * tính số từ chính bảng chứng từ. Giữ bảng tới bản deploy sau vì `deploy.yml` migrate trước khi
 * deploy, app cũ còn cần bảng trong lúc đó. Bộ đếm không còn được cập nhật nên rollback về bản cũ
 * sẽ cấp trùng số nếu không đồng bộ lại `current_value`.
 */
export const documentSequences = pgTable(
  'document_sequences',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    documentType: varchar('document_type', { length: 50 }).notNull(),
    year: integer('year').notNull().default(0),
    currentValue: integer('current_value').notNull().default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique('uq_document_sequences_type_year').on(
      table.documentType,
      table.year,
    ),
    check(
      'chk_document_sequences_current_value_non_negative',
      sql`current_value >= 0`,
    ),
  ],
);

export type DocumentSequenceSelect = typeof documentSequences.$inferSelect;
