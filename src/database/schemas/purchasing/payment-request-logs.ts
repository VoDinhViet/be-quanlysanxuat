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
import { paymentRequests } from './payment-requests';

/** Mốc ghi log của một yêu cầu thanh toán — 1 dòng đời chỉ rời PENDING đúng 1 lần (PAID hoặc
 * CANCELLED), cộng mốc CREATED lúc tự sinh. */
export enum PaymentRequestLogAction {
  CREATED = 'CREATED',
  PAID = 'PAID',
  CANCELLED = 'CANCELLED',
}

export const paymentRequestLogActionEnum = pgEnum(
  'payment_request_log_action',
  [
    PaymentRequestLogAction.CREATED,
    PaymentRequestLogAction.PAID,
    PaymentRequestLogAction.CANCELLED,
  ],
);

/**
 * Lịch sử thao tác trên một yêu cầu thanh toán — cùng khuôn `production_job_logs`, append-only
 * (không `updatedAt`). Cả 3 mốc đều ghi bằng `tx.insert` thẳng trong transaction của hành động
 * đang log (`payment-requests.service.ts`) — không gom về service log dùng chung, cùng lý do
 * `production_job_logs`. `performedBy` NULL có chủ đích ở `CREATED` — mốc tự động
 * (`createIfOrderCompleted`), không có actor.
 */
export const paymentRequestLogs = pgTable(
  'payment_request_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    paymentRequestId: uuid('payment_request_id')
      .notNull()
      .references(() => paymentRequests.id, { onDelete: 'cascade' }),
    action: paymentRequestLogActionEnum('action').notNull(),
    content: varchar('content', { length: 1000 }).notNull(),
    performedBy: uuid('performed_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_payment_request_logs_payment_request_id').on(
      table.paymentRequestId,
    ),
    index('idx_payment_request_logs_performed_by').on(table.performedBy),
  ],
);

export const paymentRequestLogsRelations = relations(
  paymentRequestLogs,
  ({ one }) => ({
    paymentRequest: one(paymentRequests, {
      fields: [paymentRequestLogs.paymentRequestId],
      references: [paymentRequests.id],
    }),
    performerBy: one(users, {
      fields: [paymentRequestLogs.performedBy],
      references: [users.id],
    }),
  }),
);

export type PaymentRequestLogSelect = typeof paymentRequestLogs.$inferSelect;
