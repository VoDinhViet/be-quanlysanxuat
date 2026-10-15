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

/**
 * `PENDING` còn sửa số lượng từng dòng (`updateProductionOrder`); `APPROVED` đã chốt, hết sửa;
 * `COMPLETED` khi mọi Job `COMPLETED`, hoặc ngay lúc duyệt nếu không dòng nào cần sản xuất. Không
 * có route đặt `COMPLETED` tay và chưa có trạng thái huỷ.
 */
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
 * LSX (lệnh sản xuất) — header. LSX thường (`source_type = 'ORDER'`) sinh từ một SO đã duyệt, LSX
 * phụ (`source_type = 'NCR'`) sinh từ một NCR. Luồng: `docs/CODEMAPS/production.md`.
 *
 * Rules:
 * - `PENDING` do `ProductionOrdersService.seedPlan` sinh trong `OrdersService.approveOrder`; còn
 *   `PENDING` thì sửa được số lượng từng dòng (`updateProductionOrder`).
 * - `APPROVED` (`approveProductionOrder`) chốt LSX và đẩy `orders.status` sang `IN_PROGRESS`; hết
 *   sửa số lượng (`E084`). Chưa có route huỷ duyệt.
 * - `code` cấp ngay lúc `seedPlan` (dòng `PENDING` cũ chưa có mã thì cấp lúc duyệt); `approvedAt`
 *   là `NULL` khi `PENDING`, có giá trị khi `APPROVED`/`COMPLETED`
 *   (`chk_production_orders_status_fields`).
 * - `orderId` unique trong nhóm `source_type = 'ORDER'` (partial unique index): mỗi SO một LSX
 *   thường. LSX phụ dùng chung `orderId` của SO, tối đa 1 LSX / (`ncrId`, `ncrAction`).
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
