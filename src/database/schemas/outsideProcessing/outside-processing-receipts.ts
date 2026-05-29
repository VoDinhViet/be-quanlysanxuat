import { relations } from 'drizzle-orm';
import { boolean, date, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { outsideProcessingOrders } from './outside-processing-orders';

/**
 * Phiếu nhận gia công ngoài OS-IN.
 */
export const outsideProcessingReceipts = pgTable('outside_processing_receipts', {
  // ID phiếu nhận.
  id: uuid('id').defaultRandom().primaryKey(),
  // Phiếu gửi PGCN.
  outsideProcessingOrderId: uuid('outside_processing_order_id')
    .notNull()
    .references(() => outsideProcessingOrders.id, { onDelete: 'cascade' }),
  // Ngày nhận.
  receivedDate: date('received_date').notNull(),
  // Số lượng nhận.
  qtyReceived: numeric('qty_received', { precision: 18, scale: 3 }).notNull(),
  // Cần QC.
  needQc: boolean('need_qc').notNull().default(false),
  // Số lượng OK.
  okQty: numeric('ok_qty', { precision: 18, scale: 3 }).notNull().default('0'),
  // Số lượng NG.
  ngQty: numeric('ng_qty', { precision: 18, scale: 3 }).notNull().default('0'),
  // Ghi chú.
  note: text('note'),
  // Thời gian tạo.
  createdAt: timestamp('created_at').defaultNow().notNull(),
  // Thời gian cập nhật.
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  // Thời gian xóa mềm.
  deletedAt: timestamp('deleted_at'),
});

export const outsideProcessingReceiptsRelations = relations(
  outsideProcessingReceipts,
  ({ one }) => ({
    outsideProcessingOrder: one(outsideProcessingOrders, {
      fields: [outsideProcessingReceipts.outsideProcessingOrderId],
      references: [outsideProcessingOrders.id],
    }),
  }),
);

export type OutsideProcessingReceipt = typeof outsideProcessingReceipts.$inferSelect;
export type NewOutsideProcessingReceipt = typeof outsideProcessingReceipts.$inferInsert;
