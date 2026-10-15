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

import { items } from '../items/items';
import { productionJobBomItems } from './production-job-bom-items';
import { productionJobIssues } from './production-job-issues';
import { productionJobLogs } from './production-job-logs';
import { productionJobNotes } from './production-job-notes';
import { productionOrders } from './production-orders';
import { users } from '../identity-access/users';

/**
 * Vòng đời Job. `WAITING_QC`/`WAITING_DELIVERY`/`COMPLETED` chuyển tự động theo tiến độ QC và nhập
 * kho thành phẩm, không có route tay. Xem `docs/CODEMAPS/production.md`.
 */
export enum ProductionJobStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  WAITING_QC = 'WAITING_QC',
  WAITING_DELIVERY = 'WAITING_DELIVERY',
  COMPLETED = 'COMPLETED',
}

export const productionJobStatusEnum = pgEnum('production_job_status', [
  ProductionJobStatus.PENDING,
  ProductionJobStatus.IN_PROGRESS,
  ProductionJobStatus.WAITING_QC,
  ProductionJobStatus.WAITING_DELIVERY,
  ProductionJobStatus.COMPLETED,
]);

/**
 * Job sản xuất — 1 thành phẩm (FG) = 1 Job trong một LSX; số lượng gộp từ mọi dòng
 * `production_order_items` cùng `itemId` (Job là đơn vị việc của xưởng, không 1-1 với
 * `orderItemId`). Chỉ sinh qua `ProductionJobsService.createJobs`, gọi từ
 * `ProductionOrdersService.approveProductionOrder` và `NcrsService.createProductionOrder`. Xem
 * `docs/CODEMAPS/production.md`.
 *
 * Rules:
 * - Snapshot BOM/công đoạn/vật tư dựng lúc `createJobs`. Tiến độ theo từng công đoạn nằm ở
 *   `production_job_operations` (`completedQuantity`/`completedDate`), không ở bảng này.
 * - `completedBy`/`completedAt` ghi khi `status` thành `COMPLETED`
 *   (`InventoryReceiptsService.closeJobIfFullyReceived`), không có route tay.
 * - `operationsApprovedBy`/`operationsApprovedAt` chỉ giữ dữ liệu cũ: bước duyệt công đoạn riêng
 *   đã bỏ, không còn code nào ghi.
 * - Chưa có cột sản lượng đạt/phế hay thông tin huỷ ở mức Job (`producedQty`, `cancelledAt`...).
 * - Lịch sử thao tác ở `production_job_logs`; hai mốc `WAITING_QC`/`WAITING_DELIVERY` cố ý không
 *   có cột người/thời điểm riêng.
 */
export const productionJobs = pgTable(
  'production_jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: varchar('code', { length: 50 }).notNull().unique(),
    productionOrderId: uuid('production_order_id')
      .notNull()
      .references(() => productionOrders.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'restrict' }),
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
    snapshotLoadedAt: timestamp('snapshot_loaded_at'),
    snapshotEditedAt: timestamp('snapshot_edited_at'),
    operationsApprovedBy: uuid('operations_approved_by').references(
      () => users.id,
      { onDelete: 'set null' },
    ),
    operationsApprovedAt: timestamp('operations_approved_at'),
    completedBy: uuid('completed_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    completedAt: timestamp('completed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique('uq_production_jobs_order_item').on(
      table.productionOrderId,
      table.itemId,
    ),
    index('idx_production_jobs_item_id').on(table.itemId),
    index('idx_production_jobs_status').on(table.status),
    index('idx_production_jobs_started_by').on(table.startedBy),
    index('idx_production_jobs_operations_approved_by').on(
      table.operationsApprovedBy,
    ),
    index('idx_production_jobs_completed_by').on(table.completedBy),
    check('chk_production_jobs_quantity', sql`quantity > 0`),
    check(
      'chk_production_jobs_status_fields',
      sql`(status = 'PENDING' AND started_at IS NULL AND completed_at IS NULL)
          OR (status = 'IN_PROGRESS' AND started_at IS NOT NULL AND completed_at IS NULL)
          OR (status = 'WAITING_QC' AND started_at IS NOT NULL AND completed_at IS NULL)
          OR (status = 'WAITING_DELIVERY' AND started_at IS NOT NULL AND completed_at IS NULL)
          OR (status = 'COMPLETED' AND started_at IS NOT NULL AND completed_at IS NOT NULL)`,
    ),
  ],
);

export const productionJobsRelations = relations(
  productionJobs,
  ({ one, many }) => ({
    productionOrder: one(productionOrders, {
      fields: [productionJobs.productionOrderId],
      references: [productionOrders.id],
    }),
    item: one(items, {
      fields: [productionJobs.itemId],
      references: [items.id],
    }),
    starterBy: one(users, {
      fields: [productionJobs.startedBy],
      references: [users.id],
    }),
    operationsApproverBy: one(users, {
      fields: [productionJobs.operationsApprovedBy],
      references: [users.id],
    }),
    completerBy: one(users, {
      fields: [productionJobs.completedBy],
      references: [users.id],
    }),
    bomItems: many(productionJobBomItems),
    issues: many(productionJobIssues),
    notes: many(productionJobNotes),
    logs: many(productionJobLogs),
  }),
);

export type ProductionJobSelect = typeof productionJobs.$inferSelect;
