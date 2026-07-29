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

/** "Chờ tạo LSX" (kế hoạch, sửa tự do) vs "Đã tạo LSX" (phát hành, chốt). */
export enum ProductionOrderStatus {
  PENDING = 'PENDING',
  ISSUED = 'ISSUED',
}

export const productionOrderStatusEnum = pgEnum('production_order_status', [
  ProductionOrderStatus.PENDING,
  ProductionOrderStatus.ISSUED,
]);

/**
 * LSX (lệnh sản xuất) — header, 1-1 với một PO đã duyệt. Xem `docs/features/production.md` để
 * biết đầy đủ luồng "duyệt PO → quyết định sản xuất → phát hành".
 *
 * Rules:
 * - `PENDING` là lúc PO mới duyệt, đang ở khâu quyết định sản xuất (`production_order_items` sửa
 *   tự do qua `PATCH /production-orders/:orderId`); `ISSUED` là sau khi "Tạo LSX" — một chiều,
 *   không có thao tác huỷ phát hành.
 * - `code`/`issuedBy`/`issuedAt` chỉ có giá trị khi `ISSUED` (`chk_production_orders_issued_fields`).
 * - `orderId` unique — mỗi PO chỉ có đúng một LSX, dù có bao nhiêu dòng/sản phẩm.
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
    issuedBy: uuid('issued_by').references(() => credentials.id, {
      onDelete: 'set null',
    }),
    issuedAt: timestamp('issued_at'),
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
      'chk_production_orders_issued_fields',
      sql`(status = 'ISSUED' AND code IS NOT NULL AND issued_at IS NOT NULL)
          OR (status = 'PENDING' AND code IS NULL AND issued_at IS NULL)`,
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
    index('idx_production_order_items_production_order_id').on(
      table.productionOrderId,
    ),
    index('idx_production_order_items_product_id').on(table.productId),
    check('chk_production_order_items_quantity', sql`quantity >= 0`),
  ],
);

/**
 * Job sản xuất — 1 sản phẩm (FG) = 1 Job trong một LSX, chỉ được sinh khi "Tạo LSX" phát hành
 * (`ProductionOrdersService.issueProductionOrders`). Số lượng gộp từ mọi dòng
 * `production_order_items` cùng `productId` trong cùng LSX — khác tầng quyết định sản xuất, tầng
 * này không giữ 1-1 với `orderItemId` vì Job là đơn vị công việc thực tế của xưởng, không phải
 * đơn vị kế toán kho.
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
    unique('uq_production_jobs_order_product').on(
      table.productionOrderId,
      table.productId,
    ),
    index('idx_production_jobs_product_id').on(table.productId),
    check('chk_production_jobs_quantity', sql`quantity > 0`),
  ],
);

export const productionOrdersRelations = relations(
  productionOrders,
  ({ one, many }) => ({
    order: one(orders, {
      fields: [productionOrders.orderId],
      references: [orders.id],
    }),
    issuer: one(credentials, {
      fields: [productionOrders.issuedBy],
      references: [credentials.id],
    }),
    creator: one(credentials, {
      fields: [productionOrders.createdBy],
      references: [credentials.id],
    }),
    items: many(productionOrderItems),
    jobs: many(productionJobs),
  }),
);

export const productionOrderItemsRelations = relations(
  productionOrderItems,
  ({ one }) => ({
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
  }),
);

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
