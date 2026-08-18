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

import { outboundOrderItems } from './outbound-order-items';
import { clients } from '../clients/clients';
import { users } from '../identity-access/users';

export enum FulfillmentType {
  STANDARD = 'STANDARD',
  EXPRESS = 'EXPRESS',
  PICKUP = 'PICKUP',
}

export const fulfillmentTypeEnum = pgEnum('fulfillment_type', [
  FulfillmentType.STANDARD,
  FulfillmentType.EXPRESS,
  FulfillmentType.PICKUP,
]);

/**
 * Vòng đời xem `docs/domains/inventory.md`, mục "Giao hàng" — phase 1 service chỉ ghi `DRAFT`,
 * 4 giá trị còn lại khai sẵn để phase sau (duyệt, xác nhận giao) không phải `ALTER TYPE`.
 */
export enum OutboundOrderStatus {
  DRAFT = 'DRAFT',
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  PENDING_DELIVERY = 'PENDING_DELIVERY',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
}

export const outboundOrderStatusEnum = pgEnum('outbound_order_status', [
  OutboundOrderStatus.DRAFT,
  OutboundOrderStatus.PENDING_APPROVAL,
  OutboundOrderStatus.PENDING_DELIVERY,
  OutboundOrderStatus.DELIVERED,
  OutboundOrderStatus.CANCELLED,
]);

/**
 * Phiếu giao hàng (DO) — header, nhiều dòng ở `outbound_order_items` (`docs/domains/inventory.md`,
 * mục "Giao hàng"). Không giữ `warehouseId` — kho xuất suy từ dòng (`outbound_order_items` ↔
 * `order_items`), không cần chọn ở header.
 */
export const outboundOrders = pgTable(
  'outbound_orders',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: varchar('code', { length: 50 }).notNull().unique(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'restrict' }),
    fulfillmentDate: date('fulfillment_date', { mode: 'date' }).notNull(),
    fulfillmentType: fulfillmentTypeEnum('fulfillment_type').notNull(),
    status: outboundOrderStatusEnum('status')
      .notNull()
      .default(OutboundOrderStatus.DRAFT),
    note: varchar('note', { length: 500 }),
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
    index('idx_outbound_orders_client_id').on(table.clientId),
    index('idx_outbound_orders_status').on(table.status),
    index('idx_outbound_orders_fulfillment_date').on(table.fulfillmentDate),
    index('idx_outbound_orders_created_by').on(table.createdBy),
  ],
);

export const outboundOrdersRelations = relations(
  outboundOrders,
  ({ one, many }) => ({
    client: one(clients, {
      fields: [outboundOrders.clientId],
      references: [clients.id],
    }),
    creatorBy: one(users, {
      fields: [outboundOrders.createdBy],
      references: [users.id],
    }),
    items: many(outboundOrderItems),
  }),
);

export type OutboundOrderSelect = typeof outboundOrders.$inferSelect;
