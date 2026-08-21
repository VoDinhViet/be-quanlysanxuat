import { relations } from 'drizzle-orm';
import {
  date,
  index,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { outsourcingOrderItems } from './outsourcing-order-items';
import { warehouses } from './warehouses';
import { suppliers } from '../suppliers/suppliers';
import { users } from '../identity-access/users';

export enum OutsourcingOrderStatus {
  POSTED = 'POSTED',
  CANCELLED = 'CANCELLED',
}

export const outsourcingOrderStatusEnum = pgEnum('outsourcing_order_status', [
  OutsourcingOrderStatus.POSTED,
  OutsourcingOrderStatus.CANCELLED,
]);

/**
 * Phiếu gửi gia công ngoài (OS-OUT) — header, nhiều dòng ở `outsourcing_order_items`. Không có
 * nháp — service luôn set `POSTED` lúc tạo, không route nào ghi giá trị khác `POSTED`/`CANCELLED`
 * (xem `docs/domains/inventory.md`, `docs/workflows/outsourcing-round-trip.md`,
 * `docs/decisions/outsourcing-no-draft.md`).
 */
export const outsourcingOrders = pgTable(
  'outsourcing_orders',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: varchar('code', { length: 50 }).notNull().unique(),
    // Tuỳ chọn — không còn dùng để trừ/theo dõi tồn kho (WIP không quản tồn,
    // docs/decisions/wip-not-stocked.md), không đọc lại ở bất kỳ response nào. Giữ cột (không
    // DROP) để không mất dữ liệu các phiếu cũ đã có warehouseId. ⚠️ Đổi NOT NULL → nullable cần
    // migration (`pnpm db:generate`) — chưa chạy ở đây vì repo đang có nhiều thay đổi schema khác
    // chưa commit, tự generate khi gộp xong.
    warehouseId: uuid('warehouse_id').references(() => warehouses.id, {
      onDelete: 'restrict',
    }),
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => suppliers.id, { onDelete: 'restrict' }),
    sendDate: date('send_date', { mode: 'date' }).notNull(),
    expectedReturnDate: date('expected_return_date', { mode: 'date' }),
    status: outsourcingOrderStatusEnum('status')
      .notNull()
      .default(OutsourcingOrderStatus.POSTED),
    note: varchar('note', { length: 1000 }),
    postedBy: uuid('posted_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    postedAt: timestamp('posted_at'),
    createdBy: uuid('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('idx_outsourcing_orders_warehouse_id').on(table.warehouseId),
    index('idx_outsourcing_orders_supplier_id').on(table.supplierId),
    index('idx_outsourcing_orders_status').on(table.status),
    index('idx_outsourcing_orders_send_date').on(table.sendDate),
    index('idx_outsourcing_orders_created_by').on(table.createdBy),
  ],
);

export const outsourcingOrdersRelations = relations(
  outsourcingOrders,
  ({ one, many }) => ({
    warehouse: one(warehouses, {
      fields: [outsourcingOrders.warehouseId],
      references: [warehouses.id],
    }),
    supplier: one(suppliers, {
      fields: [outsourcingOrders.supplierId],
      references: [suppliers.id],
    }),
    creatorBy: one(users, {
      fields: [outsourcingOrders.createdBy],
      references: [users.id],
    }),
    posterBy: one(users, {
      fields: [outsourcingOrders.postedBy],
      references: [users.id],
    }),
    items: many(outsourcingOrderItems),
  }),
);

export type OutsourcingOrderSelect = typeof outsourcingOrders.$inferSelect;
