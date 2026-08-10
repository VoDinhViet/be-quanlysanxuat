import { relations } from 'drizzle-orm';
import { index, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

import { productionJobs } from './production-jobs';
import { users } from '../identity-access/users';

/**
 * Ghi chú tự do của một Job — người dùng chủ động viết (vd trao đổi yêu cầu khách hàng, ưu tiên
 * xưởng), khác `productionOrderLogs`: đây không phải log thao tác tự động, xem
 * `docs/domains/production.md`.
 *
 * Rules:
 * - Append-only — chỉ `POST`/`GET`, không có route sửa/xoá.
 */
export const productionJobNotes = pgTable(
  'production_job_notes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    productionJobId: uuid('production_job_id')
      .notNull()
      .references(() => productionJobs.id, { onDelete: 'cascade' }),
    content: varchar('content', { length: 1000 }).notNull(),
    createdBy: uuid('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_production_job_notes_production_job_id').on(
      table.productionJobId,
    ),
  ],
);

export const productionJobNotesRelations = relations(
  productionJobNotes,
  ({ one }) => ({
    productionJob: one(productionJobs, {
      fields: [productionJobNotes.productionJobId],
      references: [productionJobs.id],
    }),
    creatorBy: one(users, {
      fields: [productionJobNotes.createdBy],
      references: [users.id],
    }),
  }),
);
