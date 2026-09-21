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
 * Vòng đời xem `docs/workflows/outbound-delivery.md`: `DRAFT ─send→ PENDING_APPROVAL
 * ─approve→ PENDING_DELIVERY ─deliver→ DELIVERED`, có nhánh `PENDING_APPROVAL ─reject→ REJECTED
 * ─send→ PENDING_APPROVAL`. `cancel` (DRAFT/PENDING_APPROVAL/PENDING_DELIVERY → CANCELLED) và
 * `DELETE` (DRAFT-only, hard delete) là hai điểm cuối riêng, không nằm trên chuỗi trên.
 */
export enum OutboundOrderStatus {
  DRAFT = 'DRAFT',
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  PENDING_DELIVERY = 'PENDING_DELIVERY',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
  REJECTED = 'REJECTED',
}

export const outboundOrderStatusEnum = pgEnum('outbound_order_status', [
  OutboundOrderStatus.DRAFT,
  OutboundOrderStatus.PENDING_APPROVAL,
  OutboundOrderStatus.PENDING_DELIVERY,
  OutboundOrderStatus.DELIVERED,
  OutboundOrderStatus.CANCELLED,
  OutboundOrderStatus.REJECTED,
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
    // 4 cột vận chuyển (BUG-090, mở rộng theo UI Spec) — tất cả nullable: PICKUP (khách tự đến
    // lấy) không có địa chỉ giao, và mọi phiếu hiện có chưa từng có giá trị nào cho các cột này.
    deliveryAddress: varchar('delivery_address', { length: 500 }),
    receiverName: varchar('receiver_name', { length: 255 }),
    receiverPhone: varchar('receiver_phone', { length: 30 }),
    vehicle: varchar('vehicle', { length: 255 }),
    createdBy: uuid('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    sentBy: uuid('sent_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    sentAt: timestamp('sent_at'),
    approvedBy: uuid('approved_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    approvedAt: timestamp('approved_at'),
    rejectedBy: uuid('rejected_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    rejectedAt: timestamp('rejected_at'),
    rejectionReason: varchar('rejection_reason', { length: 1000 }),
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
    index('idx_outbound_orders_sent_by').on(table.sentBy),
    index('idx_outbound_orders_approved_by').on(table.approvedBy),
    index('idx_outbound_orders_rejected_by').on(table.rejectedBy),
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
    senderBy: one(users, {
      fields: [outboundOrders.sentBy],
      references: [users.id],
    }),
    approverBy: one(users, {
      fields: [outboundOrders.approvedBy],
      references: [users.id],
    }),
    rejecterBy: one(users, {
      fields: [outboundOrders.rejectedBy],
      references: [users.id],
    }),
    items: many(outboundOrderItems),
  }),
);

export type OutboundOrderSelect = typeof outboundOrders.$inferSelect;
