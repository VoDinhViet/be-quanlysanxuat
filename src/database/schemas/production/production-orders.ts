import { relations, sql } from 'drizzle-orm';
import {
  check,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { orders } from '../orders/orders';
import { productionJobs } from './production-jobs';
import { productionOrderItems } from './production-order-items';
import { productionOrderLogs } from './production-order-logs';
import { users } from '../identity-access/users';

/** "Chờ duyệt" (kế hoạch, sửa số lượng tự do qua `updateProductionOrder`) vs "Đã duyệt" (chốt
 * LSX, không sửa được nữa). Chỉ 2 giá trị — chưa có trạng thái huỷ riêng (xem doc trên
 * `productionOrders`). */
export enum ProductionOrderStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
}

export const productionOrderStatusEnum = pgEnum('production_order_status', [
  ProductionOrderStatus.PENDING,
  ProductionOrderStatus.APPROVED,
]);

/**
 * LSX (lệnh sản xuất) — header, 1-1 với một PO đã duyệt. Xem `docs/domains/production.md` và
 * `docs/workflows/production-order-approval.md` để biết đầy đủ luồng duyệt PO → quyết định sản
 * xuất → duyệt LSX (chưa có huỷ duyệt).
 *
 * Rules:
 * - `PENDING` là lúc PO mới duyệt, hệ thống vừa sinh sẵn kế hoạch (`ProductionOrdersService.seedPlan`).
 *   Còn `PENDING` thì sửa được số lượng sản xuất từng dòng (`updateProductionOrder`, nhập tay).
 * - `APPROVED` (`ProductionOrdersService.approveProductionOrder`) chốt LSX và đẩy `orders.status`
 *   sang `IN_PROGRESS` — hết sửa được số lượng (`E084`). Chưa có route huỷ duyệt (đưa `APPROVED`
 *   quay lại `PENDING`) — tạm hoãn, xem `docs/domains/production.md` (Common mistakes).
 * - `code`/`approvedBy`/`approvedAt` chỉ có giá trị khi `APPROVED`, luôn `NULL` khi `PENDING`
 *   (`chk_production_orders_status_fields`).
 * - `orderId` unique — mỗi PO chỉ có đúng một LSX tại một thời điểm; duyệt lại sau khi huỷ (bằng
 *   một PO khác, hoặc `OrdersService.approveOrder` seed lại) ghi đè hoàn toàn header + dòng quyết
 *   định cũ (`seedPlan`, replace-all theo `orderId`).
 */
export const productionOrders = pgTable(
  'production_orders',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: varchar('code', { length: 50 }).unique(),
    orderId: uuid('order_id')
      .notNull()
      .unique()
      .references(() => orders.id, { onDelete: 'restrict' }),
    status: productionOrderStatusEnum('status')
      .notNull()
      .default(ProductionOrderStatus.PENDING),
    approvedBy: uuid('approved_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    approvedAt: timestamp('approved_at'),
    createdBy: uuid('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  () => [
    check(
      'chk_production_orders_status_fields',
      sql`(status = 'PENDING' AND code IS NULL AND approved_at IS NULL)
          OR (status = 'APPROVED' AND code IS NOT NULL AND approved_at IS NOT NULL)`,
    ),
  ],
);

export const productionOrdersRelations = relations(
  productionOrders,
  ({ one, many }) => ({
    order: one(orders, {
      fields: [productionOrders.orderId],
      references: [orders.id],
    }),
    approver: one(users, {
      fields: [productionOrders.approvedBy],
      references: [users.id],
    }),
    creator: one(users, {
      fields: [productionOrders.createdBy],
      references: [users.id],
    }),
    items: many(productionOrderItems),
    jobs: many(productionJobs),
    logs: many(productionOrderLogs),
  }),
);
