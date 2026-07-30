import { relations, sql } from 'drizzle-orm';
import {
  check,
  index,
  numeric,
  pgEnum,
  pgTable,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { credentials } from './credentials';
import { orderItems, orders } from './orders';
import { products } from './products';

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
 * LSX (lệnh sản xuất) — header, 1-1 với một PO đã duyệt. Xem `docs/features/production.md` để
 * biết đầy đủ luồng "duyệt PO → quyết định sản xuất → duyệt/huỷ duyệt LSX".
 *
 * Rules:
 * - `PENDING` là lúc PO mới duyệt, hệ thống vừa sinh sẵn kế hoạch (`ProductionOrdersService.seedPlan`).
 *   Còn `PENDING` thì sửa được số lượng sản xuất từng dòng (`updateProductionOrder`, nhập tay).
 * - `APPROVED` (`ProductionOrdersService.approveProductionOrder`) chốt LSX và đẩy `orders.status`
 *   sang `IN_PROGRESS` — hết sửa được số lượng (`E084`). Chưa có route huỷ duyệt (đưa `APPROVED`
 *   quay lại `PENDING`) — tạm hoãn, xem `docs/features/production.md`.
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
    status: productionOrderStatusEnum('status').notNull().default(ProductionOrderStatus.PENDING),
    approvedBy: uuid('approved_by').references(() => credentials.id, {
      onDelete: 'set null',
    }),
    approvedAt: timestamp('approved_at'),
    createdBy: uuid('created_by').references(() => credentials.id, {
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

/**
 * Phần con "quyết định sản xuất" của một LSX — 1 dòng cho mỗi dòng PO (`order_items`) status
 * NORMAL, mang Đề xuất SX + snapshot tồn tại lần ghi gần nhất. Giữ 1-1 với `orderItemId` (không
 * gộp theo sản phẩm ở tầng này) vì phiếu xuất kho cần `orderItemId` để delivery tracking (xem
 * `docs/features/inventory.md`) — gộp theo sản phẩm chỉ xảy ra ở tầng `production_jobs`.
 *
 * `orderItemId` dùng `restrict`, không `cascade` — `OrdersService.updateOrder` tự xoá các dòng
 * của LSX chưa phát hành trước khi replace `order_items` (transaction theo
 * `.claude/rules/api-module.md`), thay vì trông cậy FK tự dọn.
 */
export const productionOrderItems = pgTable(
  'production_order_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    productionOrderId: uuid('production_order_id')
      .notNull()
      .references(() => productionOrders.id, { onDelete: 'cascade' }),
    orderItemId: uuid('order_item_id')
      .notNull()
      .unique()
      .references(() => orderItems.id, { onDelete: 'restrict' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    // Đề xuất SX đã chốt (do hệ thống gợi ý hoặc người dùng sửa tay).
    quantity: numeric('quantity', {
      precision: 18,
      scale: 3,
      mode: 'number',
    }).notNull(),
    // Snapshot số liệu người dùng nhìn thấy tại lần ghi gần nhất của dòng này.
    orderQty: numeric('order_qty', {
      precision: 18,
      scale: 3,
      mode: 'number',
    }).notNull(),
    onHandQty: numeric('on_hand_qty', {
      precision: 18,
      scale: 3,
      mode: 'number',
    }).notNull(),
    // Có thể âm — "Khả dụng" là onHand trừ nhu cầu reserved của mọi đơn đang mở khác.
    availableQty: numeric('available_qty', {
      precision: 18,
      scale: 3,
      mode: 'number',
    }).notNull(),
    fromStockQty: numeric('from_stock_qty', {
      precision: 18,
      scale: 3,
      mode: 'number',
    }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('idx_production_order_items_production_order_id').on(table.productionOrderId),
    index('idx_production_order_items_product_id').on(table.productId),
    check('chk_production_order_items_quantity', sql`quantity >= 0`),
  ],
);

/**
 * Job sản xuất — 1 sản phẩm (FG) = 1 Job trong một LSX. Số lượng gộp từ mọi dòng
 * `production_order_items` cùng `productId` trong cùng LSX — khác tầng quyết định sản xuất, tầng
 * này không giữ 1-1 với `orderItemId` vì Job là đơn vị công việc thực tế của xưởng, không phải
 * đơn vị kế toán kho. Đường ghi từng sinh Job ("Tạo LSX" phát hành,
 * `ProductionOrdersService.issueProductionOrders`) đã bỏ 2026-07-30; sống lại cùng ngày qua
 * `ProductionJobsService.createJobs`, gọi từ `ProductionOrdersService.approveProductionOrder`
 * (chốt LSX sang `APPROVED`) thay vì phát hành — xem `docs/features/production.md`.
 */
export const productionJobs = pgTable(
  'production_jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: varchar('code', { length: 50 }).notNull().unique(),
    productionOrderId: uuid('production_order_id')
      .notNull()
      .references(() => productionOrders.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    quantity: numeric('quantity', {
      precision: 18,
      scale: 3,
      mode: 'number',
    }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique('uq_production_jobs_order_product').on(table.productionOrderId, table.productId),
    index('idx_production_jobs_product_id').on(table.productId),
    check('chk_production_jobs_quantity', sql`quantity > 0`),
  ],
);

/** "Hành động" ghi log trên một LSX — mở rộng khi có thêm đường ghi mới trên `productionOrders`
 * (ví dụ huỷ duyệt, khi route đó được làm). */
export enum ProductionOrderLogAction {
  CREATED = 'CREATED',
  QUANTITY_UPDATED = 'QUANTITY_UPDATED',
  APPROVED = 'APPROVED',
}

export const productionOrderLogActionEnum = pgEnum('production_order_log_action', [
  ProductionOrderLogAction.CREATED,
  ProductionOrderLogAction.QUANTITY_UPDATED,
  ProductionOrderLogAction.APPROVED,
]);

/**
 * Lịch sử thao tác trên một LSX — thời gian (`createdAt`), người thực hiện (`performedBy`), nội
 * dung (`content`, mô tả sẵn bằng tiếng Việt, sinh tại nơi ghi chứ không tính lại lúc đọc). Append
 * -only, không có `updatedAt` — cùng khuôn `order_attachments`/`client_contacts`, một dòng log
 * không bao giờ bị `UPDATE`.
 *
 * Rules:
 * - `ProductionOrdersService.logAction` là nơi ghi duy nhất, luôn gọi trong cùng transaction với
 *   hành động đang log (`seedPlan` → `CREATED`, `updateProductionOrder` → `QUANTITY_UPDATED`,
 *   `approveProductionOrder` → `APPROVED`) — không có route ghi log trực tiếp.
 * - `onDelete: 'cascade'` từ `productionOrders` — khi header bị xoá để ghi đè (replace-all lúc
 *   `seedPlan`/`OrdersService.updateOrder` xoá LSX `PENDING`), log cũ mất theo, cùng hành vi với
 *   `production_order_items`, không phải rủi ro riêng của bảng này.
 */
export const productionOrderLogs = pgTable(
  'production_order_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    productionOrderId: uuid('production_order_id')
      .notNull()
      .references(() => productionOrders.id, { onDelete: 'cascade' }),
    action: productionOrderLogActionEnum('action').notNull(),
    content: varchar('content', { length: 1000 }).notNull(),
    performedBy: uuid('performed_by').references(() => credentials.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('idx_production_order_logs_production_order_id').on(table.productionOrderId)],
);

export const productionOrdersRelations = relations(productionOrders, ({ one, many }) => ({
  order: one(orders, {
    fields: [productionOrders.orderId],
    references: [orders.id],
  }),
  approver: one(credentials, {
    fields: [productionOrders.approvedBy],
    references: [credentials.id],
  }),
  creator: one(credentials, {
    fields: [productionOrders.createdBy],
    references: [credentials.id],
  }),
  items: many(productionOrderItems),
  jobs: many(productionJobs),
  logs: many(productionOrderLogs),
}));

export const productionOrderItemsRelations = relations(productionOrderItems, ({ one }) => ({
  productionOrder: one(productionOrders, {
    fields: [productionOrderItems.productionOrderId],
    references: [productionOrders.id],
  }),
  orderItem: one(orderItems, {
    fields: [productionOrderItems.orderItemId],
    references: [orderItems.id],
  }),
  product: one(products, {
    fields: [productionOrderItems.productId],
    references: [products.id],
  }),
}));

export const productionJobsRelations = relations(productionJobs, ({ one }) => ({
  productionOrder: one(productionOrders, {
    fields: [productionJobs.productionOrderId],
    references: [productionOrders.id],
  }),
  product: one(products, {
    fields: [productionJobs.productId],
    references: [products.id],
  }),
}));

export const productionOrderLogsRelations = relations(productionOrderLogs, ({ one }) => ({
  productionOrder: one(productionOrders, {
    fields: [productionOrderLogs.productionOrderId],
    references: [productionOrders.id],
  }),
  performer: one(credentials, {
    fields: [productionOrderLogs.performedBy],
    references: [credentials.id],
  }),
}));
