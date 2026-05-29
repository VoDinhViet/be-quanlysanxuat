import { relations } from 'drizzle-orm';
import {
  date,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { clients } from './clients';
import { products } from './products';
import { users } from './users';

export enum OrderStatus {
  PendingApproval = 'pending_approval',
  Approved = 'approved',
  Rejected = 'rejected',
  Cancelled = 'cancelled',
}

export enum OrderFileType {
  OrderPdf = 'order_pdf',
  ImportExcel = 'import_excel',
}

export const orderStatusEnum = pgEnum('order_status', [
  OrderStatus.PendingApproval,
  OrderStatus.Approved,
  OrderStatus.Rejected,
  OrderStatus.Cancelled,
]);

export const orderFileTypeEnum = pgEnum('order_file_type', [
  OrderFileType.OrderPdf,
  OrderFileType.ImportExcel,
]);

export const orders = pgTable('orders', {
  // ID đơn hàng.
  id: uuid('id').defaultRandom().primaryKey(),
  // Khách hàng.
  clientId: uuid('client_id')
    .notNull()
    .references(() => clients.id, { onDelete: 'restrict' }),
  // Mã PO.
  code: varchar('code', { length: 50 }).notNull(),
  // Số PR.
  prNumber: varchar('pr_number', { length: 50 }).notNull(),
  // Ngày giao hàng.
  dueDate: date('due_date').notNull(),
  // Ghi chú.
  note: text('note'),
  // Mức VAT: 0, 5, 8, hoặc 10.
  vatRate: integer('vat_rate').notNull().default(0),
  // Tổng trước VAT.
  subTotal: numeric('sub_total', { precision: 18, scale: 2 }).notNull().default('0'),
  // Tiền VAT.
  vatAmount: numeric('vat_amount', { precision: 18, scale: 2 }).notNull().default('0'),
  // Tổng sau VAT.
  totalAfterVat: numeric('total_after_vat', { precision: 18, scale: 2 }).notNull().default('0'),
  // Trạng thái duyệt.
  status: orderStatusEnum('status').notNull().default(OrderStatus.PendingApproval),
  // Người duyệt.
  approvedBy: uuid('approved_by').references(() => users.id, { onDelete: 'set null' }),
  // Thời gian duyệt.
  approvedAt: timestamp('approved_at'),
  // Người từ chối.
  rejectedBy: uuid('rejected_by').references(() => users.id, { onDelete: 'set null' }),
  // Thời gian từ chối.
  rejectedAt: timestamp('rejected_at'),
  // Lý do từ chối.
  rejectedReason: text('rejected_reason'),
  // Người tạo.
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  // Người cập nhật cuối.
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
  // Thời gian tạo.
  createdAt: timestamp('created_at').defaultNow().notNull(),
  // Thời gian cập nhật.
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  // Thời gian xóa mềm.
  deletedAt: timestamp('deleted_at'),
});

export const orderItems = pgTable('order_items', {
  // ID dòng hàng.
  id: uuid('id').defaultRandom().primaryKey(),
  // Đơn hàng.
  orderId: uuid('order_id')
    .notNull()
    .references(() => orders.id, { onDelete: 'cascade' }),
  // Thành phẩm.
  productId: uuid('product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'restrict' }),
  // Snapshot mã thành phẩm.
  productCode: varchar('product_code', { length: 50 }).notNull(),
  // Snapshot tên thành phẩm.
  productName: varchar('product_name', { length: 255 }).notNull(),
  // Đơn vị tính.
  unit: varchar('unit', { length: 50 }).notNull(),
  // Số lượng.
  quantity: numeric('quantity', { precision: 18, scale: 3 }).notNull(),
  // Snapshot đơn giá.
  unitPrice: numeric('unit_price', { precision: 18, scale: 2 }).notNull(),
  // Thành tiền.
  lineTotal: numeric('line_total', { precision: 18, scale: 2 }).notNull(),
  // Thời gian tạo.
  createdAt: timestamp('created_at').defaultNow().notNull(),
  // Thời gian cập nhật.
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  // Thời gian xóa mềm.
  deletedAt: timestamp('deleted_at'),
});

export const orderFiles = pgTable('order_files', {
  // ID file.
  id: uuid('id').defaultRandom().primaryKey(),
  // Đơn hàng.
  orderId: uuid('order_id')
    .notNull()
    .references(() => orders.id, { onDelete: 'cascade' }),
  // Mục đích file.
  fileType: orderFileTypeEnum('file_type').notNull(),
  // Tên file gốc.
  originalName: varchar('original_name', { length: 255 }).notNull(),
  // Tên file lưu trữ.
  fileName: varchar('file_name', { length: 255 }).notNull(),
  // Loại MIME.
  mimeType: varchar('mime_type', { length: 100 }),
  // Dung lượng byte.
  fileSize: integer('file_size'),
  // Đường dẫn lưu trữ.
  filePath: text('file_path').notNull(),
  // Người tải lên.
  uploadedBy: uuid('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
  // Thời gian tạo.
  createdAt: timestamp('created_at').defaultNow().notNull(),
  // Thời gian cập nhật.
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  // Thời gian xóa mềm.
  deletedAt: timestamp('deleted_at'),
});

export const ordersRelations = relations(orders, ({ one, many }) => ({
  client: one(clients, {
    fields: [orders.clientId],
    references: [clients.id],
  }),
  items: many(orderItems),
  files: many(orderFiles),
  approver: one(users, {
    fields: [orders.approvedBy],
    references: [users.id],
  }),
  rejecter: one(users, {
    fields: [orders.rejectedBy],
    references: [users.id],
  }),
  creator: one(users, {
    fields: [orders.createdBy],
    references: [users.id],
  }),
  updater: one(users, {
    fields: [orders.updatedBy],
    references: [users.id],
  }),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
  product: one(products, {
    fields: [orderItems.productId],
    references: [products.id],
  }),
}));

export const orderFilesRelations = relations(orderFiles, ({ one }) => ({
  order: one(orders, {
    fields: [orderFiles.orderId],
    references: [orders.id],
  }),
  uploader: one(users, {
    fields: [orderFiles.uploadedBy],
    references: [users.id],
  }),
}));

export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
export type OrderItem = typeof orderItems.$inferSelect;
export type NewOrderItem = typeof orderItems.$inferInsert;
export type OrderFile = typeof orderFiles.$inferSelect;
export type NewOrderFile = typeof orderFiles.$inferInsert;
