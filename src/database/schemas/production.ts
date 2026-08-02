import { relations, sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { materials } from './materials';
import { operations } from './operations';
import { orderItems, orders } from './orders';
import { products } from './products';
import { users } from './users';

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

/**
 * Phần con "quyết định sản xuất" của một LSX — 1 dòng cho mỗi dòng PO (`order_items`) status
 * NORMAL, mang Đề xuất SX + snapshot tồn tại lần ghi gần nhất. Giữ 1-1 với `orderItemId` (không
 * gộp theo sản phẩm ở tầng này) vì phiếu xuất kho cần `orderItemId` để delivery tracking (xem
 * `docs/domains/inventory.md`) — gộp theo sản phẩm chỉ xảy ra ở tầng `production_jobs`.
 *
 * `orderItemId` dùng `restrict`, không `cascade` — `OrdersService.updateOrder` tự xoá các dòng
 * của LSX chưa phát hành trước khi replace `order_items` (transaction theo
 * `.claude/rules/service.md`), thay vì trông cậy FK tự dọn.
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
 * Vòng đời một Job sau khi được sinh ra (thêm 2026-07-30, xem `docs/domains/production.md`).
 *
 * Rules:
 * - Rút từ 5 xuống 3 giá trị 2026-07-31 (bỏ `COMPLETED`/`CANCELLED`, đổi tên `PAUSED` → `WAITING`),
 *   rồi bỏ hẳn `WAITING` — xưởng hiện chưa cần trạng thái chờ.
 * - Chỉ còn 2 giá trị, một chiều `PENDING → IN_PROGRESS`, không có đường lùi và không có điểm kết
 *   thúc nào khác `IN_PROGRESS` — một Job đã bắt đầu đứng nguyên ở đó vĩnh viễn qua API.
 */
export enum ProductionJobStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
}

export const productionJobStatusEnum = pgEnum('production_job_status', [
  ProductionJobStatus.PENDING,
  ProductionJobStatus.IN_PROGRESS,
]);

/**
 * Job sản xuất — 1 sản phẩm (FG) = 1 Job trong một LSX. Số lượng gộp từ mọi dòng
 * `production_order_items` cùng `productId` trong cùng LSX — khác tầng quyết định sản xuất, tầng
 * này không giữ 1-1 với `orderItemId` vì Job là đơn vị công việc thực tế của xưởng, không phải
 * đơn vị kế toán kho. Đường ghi từng sinh Job ("Tạo LSX" phát hành,
 * `ProductionOrdersService.issueProductionOrders`) đã bỏ 2026-07-30; sống lại cùng ngày qua
 * `ProductionJobsService.createJobs`, gọi từ `ProductionOrdersService.approveProductionOrder`
 * (chốt LSX sang `APPROVED`) thay vì phát hành — xem `docs/domains/production.md`.
 *
 * Rules:
 * - `status` thêm 2026-07-30 — vòng đời ở mức Job, vẫn chưa chia tiến độ theo công đoạn dù
 *   `createJobs` đã snapshot công đoạn (`productionJobSteps`) + vật tư (`productionJobMaterials`),
 *   xem `docs/domains/production.md`.
 * - `producedQty`/`rejectedQty` (báo sản lượng cộng dồn) và `completedBy`/`completedAt`/
 *   `cancelledBy`/`cancelledAt`/`cancelReason` đều đã xoá — Job hiện không còn cách nào qua API để
 *   ghi nhận sản lượng đạt/phế, chỉ còn `start` chuyển `PENDING → IN_PROGRESS`. Tạm hoãn, xem
 *   `docs/domains/production.md` (mở rộng lại khi xưởng cần theo dõi sản lượng qua hệ thống).
 * - Không còn lưu lịch sử thao tác Job từ 2026-07-31 (`production_job_logs` đã xoá hẳn, khác LSX —
 *   `production_order_logs` vẫn còn) — chỉ `startedBy`/`startedAt` (cột thật) còn giữ được cho
 *   `start`.
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
    status: productionJobStatusEnum('status')
      .notNull()
      .default(ProductionJobStatus.PENDING),
    startedBy: uuid('started_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    startedAt: timestamp('started_at'),
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
    index('idx_production_jobs_status').on(table.status),
    check('chk_production_jobs_quantity', sql`quantity > 0`),
    check(
      'chk_production_jobs_status_fields',
      sql`status <> 'PENDING' OR started_at IS NULL`,
    ),
  ],
);

/**
 * Snapshot công đoạn của một Job — copy routing **Cấp 0** của sản phẩm (`routing_steps.productId`)
 * trong transaction duyệt LSX (`ProductionJobsService.createJobs`). Đóng băng, không có route sửa —
 * sửa routing gốc sau đó không ảnh hưởng Job đã duyệt. Xem bảng so sánh với
 * `productionJobMaterials` ở `docs/domains/production.md`.
 *
 * Rules:
 * - Không unique `(productionJobId, operationId)` — một routing được phép lặp lại cùng công đoạn
 *   (`routing_steps` cũng vậy), ép unique sẽ nuốt mất bước khi copy.
 * - Không `updatedAt` — append-only, cùng khuôn `production_order_logs`.
 */
export const productionJobSteps = pgTable(
  'production_job_steps',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    productionJobId: uuid('production_job_id')
      .notNull()
      .references(() => productionJobs.id, { onDelete: 'cascade' }),
    // restrict: cùng lý do `routing_steps.operationId` — `operations` xoá mềm nên vẫn cho nghỉ
    // được mà không làm hỏng tham chiếu này.
    operationId: uuid('operation_id')
      .notNull()
      .references(() => operations.id, { onDelete: 'restrict' }),
    sortOrder: integer('sort_order').notNull().default(0),
    note: varchar('note', { length: 1000 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_production_job_steps_production_job_id').on(
      table.productionJobId,
    ),
    index('idx_production_job_steps_operation_id').on(table.operationId),
  ],
);

/**
 * Danh sách vật tư của một Job — khởi tạo bằng cách gộp BOM theo vật tư (cùng phép `SUM` của
 * `GET /products/:id/bom/materials`, không nổ theo cấp) nhân với SL Job, trong transaction duyệt
 * LSX. Hiện là **read-only** (`GET /production-jobs/:jobId/materials`) — chưa có route sửa, tạm
 * hoãn; dự kiến mở rộng sang CRUD từng dòng sau này. Xem `docs/domains/production.md`.
 *
 * Rules:
 * - `unitQty` là định mức BOM lúc duyệt, **bất biến**. NULL để sẵn chỗ cho lúc có CRUD — dòng
 *   người dùng thêm tay (ngoài BOM) sẽ không có định mức gốc.
 * - Unique `(productionJobId, materialId)` — khác `productionJobSteps`, nguồn đã gộp sẵn theo vật
 *   tư nên một vật tư chỉ có đúng một dòng cho mỗi Job.
 * - Không `updatedAt` — append-only lúc sinh, chưa có route ghi nào khác.
 */
export const productionJobMaterials = pgTable(
  'production_job_materials',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    productionJobId: uuid('production_job_id')
      .notNull()
      .references(() => productionJobs.id, { onDelete: 'cascade' }),
    materialId: uuid('material_id')
      .notNull()
      .references(() => materials.id, { onDelete: 'restrict' }),
    unitQty: numeric('unit_qty', { precision: 18, scale: 3, mode: 'number' }),
    requiredQty: numeric('required_qty', {
      precision: 18,
      scale: 3,
      mode: 'number',
    }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    unique('uq_production_job_materials_job_material').on(
      table.productionJobId,
      table.materialId,
    ),
    index('idx_production_job_materials_material_id').on(table.materialId),
    check(
      'chk_production_job_materials_qty',
      sql`(unit_qty IS NULL OR unit_qty > 0) AND required_qty > 0`,
    ),
  ],
);

/**
 * Ghi chú tự do của một Job — người dùng chủ động viết (vd trao đổi yêu cầu khách hàng, ưu tiên
 * xưởng), khác `productionOrderLogs`: đây không phải log thao tác tự động, xem
 * `docs/domains/production.md`.
 *
 * Rules:
 * - Append-only — chỉ `POST`/`GET`, không có route sửa/xoá.
 */
export const productionJobNotes = pgTable(
  'production_job_notes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    productionJobId: uuid('production_job_id')
      .notNull()
      .references(() => productionJobs.id, { onDelete: 'cascade' }),
    content: varchar('content', { length: 1000 }).notNull(),
    createdBy: uuid('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_production_job_notes_production_job_id').on(
      table.productionJobId,
    ),
  ],
);

/** "Hành động" ghi log trên một LSX — mở rộng khi có thêm đường ghi mới trên `productionOrders`
 * (ví dụ huỷ duyệt, khi route đó được làm). */
export enum ProductionOrderLogAction {
  CREATED = 'CREATED',
  QUANTITY_UPDATED = 'QUANTITY_UPDATED',
  APPROVED = 'APPROVED',
}

export const productionOrderLogActionEnum = pgEnum(
  'production_order_log_action',
  [
    ProductionOrderLogAction.CREATED,
    ProductionOrderLogAction.QUANTITY_UPDATED,
    ProductionOrderLogAction.APPROVED,
  ],
);

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
    performedBy: uuid('performed_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_production_order_logs_production_order_id').on(
      table.productionOrderId,
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

export const productionJobsRelations = relations(
  productionJobs,
  ({ one, many }) => ({
    productionOrder: one(productionOrders, {
      fields: [productionJobs.productionOrderId],
      references: [productionOrders.id],
    }),
    product: one(products, {
      fields: [productionJobs.productId],
      references: [products.id],
    }),
    starter: one(users, {
      fields: [productionJobs.startedBy],
      references: [users.id],
    }),
    steps: many(productionJobSteps),
    materials: many(productionJobMaterials),
    notes: many(productionJobNotes),
  }),
);

export const productionJobStepsRelations = relations(
  productionJobSteps,
  ({ one }) => ({
    productionJob: one(productionJobs, {
      fields: [productionJobSteps.productionJobId],
      references: [productionJobs.id],
    }),
    operation: one(operations, {
      fields: [productionJobSteps.operationId],
      references: [operations.id],
    }),
  }),
);

export const productionJobMaterialsRelations = relations(
  productionJobMaterials,
  ({ one }) => ({
    productionJob: one(productionJobs, {
      fields: [productionJobMaterials.productionJobId],
      references: [productionJobs.id],
    }),
    material: one(materials, {
      fields: [productionJobMaterials.materialId],
      references: [materials.id],
    }),
  }),
);

export const productionOrderLogsRelations = relations(
  productionOrderLogs,
  ({ one }) => ({
    productionOrder: one(productionOrders, {
      fields: [productionOrderLogs.productionOrderId],
      references: [productionOrders.id],
    }),
    performer: one(users, {
      fields: [productionOrderLogs.performedBy],
      references: [users.id],
    }),
  }),
);

export const productionJobNotesRelations = relations(
  productionJobNotes,
  ({ one }) => ({
    productionJob: one(productionJobs, {
      fields: [productionJobNotes.productionJobId],
      references: [productionJobs.id],
    }),
    creator: one(users, {
      fields: [productionJobNotes.createdBy],
      references: [users.id],
    }),
  }),
);
