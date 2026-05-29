import { relations } from 'drizzle-orm';
import { pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

import { jobOperations } from '../job-operations';
import { routingSteps } from './routing-steps';

export const operations = pgTable('operations', {
  // ID công đoạn.
  id: uuid('id').defaultRandom().primaryKey(),
  // Mã công đoạn.
  code: varchar('code', { length: 50 }).notNull(),
  // Tên công đoạn.
  name: varchar('name', { length: 255 }).notNull(),
  // Ghi chú.
  note: text('note'),
  // Thời gian tạo.
  createdAt: timestamp('created_at').defaultNow().notNull(),
  // Thời gian cập nhật.
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  // Thời gian xóa mềm.
  deletedAt: timestamp('deleted_at'),
});

export const operationsRelations = relations(operations, ({ many }) => ({
  jobOperations: many(jobOperations),
  routingSteps: many(routingSteps),
}));

export type Operation = typeof operations.$inferSelect;
export type NewOperation = typeof operations.$inferInsert;
