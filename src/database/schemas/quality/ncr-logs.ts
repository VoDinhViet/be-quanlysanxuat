import { relations } from 'drizzle-orm';
import {
  index,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { users } from '../identity-access/users';
import { ncrs } from './ncrs';

export enum NcrLogAction {
  CREATED = 'CREATED',
  UPDATED = 'UPDATED',
  SUBMITTED = 'SUBMITTED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  PRODUCTION_ORDER_CREATED = 'PRODUCTION_ORDER_CREATED',
  OQC_REQUESTED = 'OQC_REQUESTED',
  PENDING_QC = 'PENDING_QC',
  CLOSED = 'CLOSED',
}

export const ncrLogActionEnum = pgEnum('ncr_log_action', [
  NcrLogAction.CREATED,
  NcrLogAction.UPDATED,
  NcrLogAction.SUBMITTED,
  NcrLogAction.APPROVED,
  NcrLogAction.REJECTED,
  NcrLogAction.PRODUCTION_ORDER_CREATED,
  NcrLogAction.OQC_REQUESTED,
  NcrLogAction.PENDING_QC,
  NcrLogAction.CLOSED,
]);

/** Lịch sử thao tác NCR — append-only, cùng khuôn `payment_request_logs`. */
export const ncrLogs = pgTable(
  'ncr_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ncrId: uuid('ncr_id')
      .notNull()
      .references(() => ncrs.id, { onDelete: 'cascade' }),
    action: ncrLogActionEnum('action').notNull(),
    content: varchar('content', { length: 1000 }).notNull(),
    performedBy: uuid('performed_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_ncr_logs_ncr_id').on(table.ncrId),
    index('idx_ncr_logs_performed_by').on(table.performedBy),
  ],
);

export const ncrLogsRelations = relations(ncrLogs, ({ one }) => ({
  ncr: one(ncrs, { fields: [ncrLogs.ncrId], references: [ncrs.id] }),
  performerBy: one(users, {
    fields: [ncrLogs.performedBy],
    references: [users.id],
  }),
}));

export type NcrLogSelect = typeof ncrLogs.$inferSelect;
