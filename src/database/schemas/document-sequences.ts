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
 * Bộ đếm dùng chung cho mọi mã chứng từ tự sinh — đường ghi duy nhất là
 * `generateDocumentSequence(s)` (`src/common/utils/document-sequence.util.ts`), xem
 * `docs/architecture.md`. `year = 0` là sentinel cho chứng từ không đánh số theo năm, không dùng
 * NULL: Postgres coi NULL trong UNIQUE là "distinct", phá cả ràng buộc lẫn `ON CONFLICT`.
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
