import { relations } from 'drizzle-orm';
import {
  index,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { files } from '../files';
import { paymentRequests } from './payment-requests';

/**
 * Ảnh/file đính kèm của yêu cầu thanh toán; thêm/bớt được ở mọi trạng thái trừ `CANCELLED`.
 *
 * Rules:
 * - `fileId` dùng `restrict`: chứng từ thanh toán, xoá `files` không được kéo theo mất dấu vết.
 * - Bỏ file khỏi phiếu chỉ xoá dòng nối, không xoá file trong kho lưu trữ.
 */
export const paymentRequestFiles = pgTable(
  'payment_request_files',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    paymentRequestId: uuid('payment_request_id')
      .notNull()
      .references(() => paymentRequests.id, { onDelete: 'cascade' }),
    fileId: uuid('file_id')
      .notNull()
      .references(() => files.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('uq_payment_request_files_request_file').on(
      table.paymentRequestId,
      table.fileId,
    ),
    index('idx_payment_request_files_file_id').on(table.fileId),
  ],
);

export const paymentRequestFilesRelations = relations(
  paymentRequestFiles,
  ({ one }) => ({
    paymentRequest: one(paymentRequests, {
      fields: [paymentRequestFiles.paymentRequestId],
      references: [paymentRequests.id],
    }),
    file: one(files, {
      fields: [paymentRequestFiles.fileId],
      references: [files.id],
    }),
  }),
);

export type PaymentRequestFileSelect = typeof paymentRequestFiles.$inferSelect;
