import { relations, sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  check,
  index,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { orders } from '../orders/orders';
import { productionJobs } from './production-jobs';
import { productionOrderItems } from './production-order-items';
import { productionOrderLogs } from './production-order-logs';
import { users } from '../identity-access/users';
import { ncrs } from '../quality/ncrs';
import { files } from '../files';

/** "Chờ duyệt" (kế hoạch, sửa số lượng tự do qua `updateProductionOrder`) vs "Đã duyệt" (chốt
 * LSX, không sửa được nữa) vs "Hoàn thành" (mọi Job đã `COMPLETED`, tự động đóng — không có route
 * tay, xem `docs/decisions/production-lifecycle-closing.md`). Chưa có trạng thái huỷ riêng (xem
 * doc trên `productionOrders`). */
export enum ProductionOrderStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  COMPLETED = 'COMPLETED',
}

export const productionOrderStatusEnum = pgEnum('production_order_status', [
  ProductionOrderStatus.PENDING,
  ProductionOrderStatus.APPROVED,
  ProductionOrderStatus.COMPLETED,
]);

/** `ORDER` = LSX sinh từ đơn hàng (1 LSX / đơn); `NCR` = LSX phụ sửa chữa / làm mới từ một NCR
 * (cùng `orderId` với đơn liên quan, không có dòng `production_order_items`). */
export enum ProductionOrderSourceType {
  ORDER = 'ORDER',
  NCR = 'NCR',
}

export const productionOrderSourceTypeEnum = pgEnum(
  'production_order_source_type',
  [ProductionOrderSourceType.ORDER, ProductionOrderSourceType.NCR],
);

export enum ProductionOrderNcrAction {
  REWORK = 'REWORK',
  REMAKE = 'REMAKE',
}

export const productionOrderNcrActionEnum = pgEnum(
  'production_order_ncr_action',
  [ProductionOrderNcrAction.REWORK, ProductionOrderNcrAction.REMAKE],
);

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
 * - `code` cấp ngay khi sinh kế hoạch (`seedPlan`, dòng cũ chưa có mã thì cấp lúc duyệt);
 *   `approvedBy`/`approvedAt` chỉ có giá trị khi `APPROVED`, luôn `NULL` khi `PENDING`
 *   (`chk_production_orders_status_fields`).
 * - `orderId` unique trong nhóm `source_type = 'ORDER'` (partial unique index) — mỗi PO chỉ có
 *   đúng một LSX thường tại một thời điểm; LSX phụ NCR (`source_type = 'NCR'`) dùng chung `orderId`
 *   của đơn liên quan, tối đa 1 LSX / (`ncrId`, `ncrAction`); duyệt lại sau khi huỷ (bằng
 *   một PO khác, hoặc `OrdersService.approveOrder` seed lại) ghi đè hoàn toàn header + dòng quyết
 *   định cũ (`seedPlan`, replace-all theo `orderId`).
 * - `COMPLETED` tự động khi mọi `productionJobs` của LSX đạt `COMPLETED` — không có route tay, xem
 *   `docs/decisions/production-lifecycle-closing.md`.
 */
export const productionOrders = pgTable(
  'production_orders',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: varchar('code', { length: 50 }).unique(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    sourceType: productionOrderSourceTypeEnum('source_type')
      .notNull()
      .default(ProductionOrderSourceType.ORDER),
    ncrId: uuid('ncr_id').references((): AnyPgColumn => ncrs.id, {
      onDelete: 'restrict',
    }),
    ncrAction: productionOrderNcrActionEnum('ncr_action'),
    status: productionOrderStatusEnum('status')
      .notNull()
      .default(ProductionOrderStatus.PENDING),
    approvedBy: uuid('approved_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    approvedAt: timestamp('approved_at'),
    signedFileId: uuid('signed_file_id').references(() => files.id, {
      onDelete: 'set null',
    }),
    // Ghi chú của chính LSX — khác `orders.note` (ghi chú đơn hàng gốc), hai cột độc lập.
    note: varchar('note', { length: 1000 }),
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
    index('idx_production_orders_approved_by').on(table.approvedBy),
    index('idx_production_orders_created_by').on(table.createdBy),
    index('idx_production_orders_signed_file_id').on(table.signedFileId),
    index('idx_production_orders_order_id').on(table.orderId),
    uniqueIndex('uq_production_orders_order_id_source_order')
      .on(table.orderId)
      .where(sql`source_type = 'ORDER'`),
    uniqueIndex('uq_production_orders_ncr_action')
      .on(table.ncrId, table.ncrAction)
      .where(sql`ncr_id IS NOT NULL`),
    check(
      'chk_production_orders_source_ncr',
      sql`(source_type = 'NCR') = (ncr_id IS NOT NULL AND ncr_action IS NOT NULL)`,
    ),
    check(
      'chk_production_orders_status_fields',
      sql`(status = 'PENDING' AND approved_at IS NULL)
          OR (status = 'APPROVED' AND code IS NOT NULL AND approved_at IS NOT NULL)
          OR (status = 'COMPLETED' AND code IS NOT NULL AND approved_at IS NOT NULL)`,
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
    approverBy: one(users, {
      fields: [productionOrders.approvedBy],
      references: [users.id],
    }),
    signedFile: one(files, {
      fields: [productionOrders.signedFileId],
      references: [files.id],
    }),
    creatorBy: one(users, {
      fields: [productionOrders.createdBy],
      references: [users.id],
    }),
    ncr: one(ncrs, {
      fields: [productionOrders.ncrId],
      references: [ncrs.id],
    }),
    items: many(productionOrderItems),
    jobs: many(productionJobs),
    logs: many(productionOrderLogs),
  }),
);

export type ProductionOrderSelect = typeof productionOrders.$inferSelect;
