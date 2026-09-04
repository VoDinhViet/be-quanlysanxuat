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
 * Vòng đời một Job sau khi được sinh ra (thêm 2026-07-30, xem `docs/domains/production.md`).
 *
 * Rules:
 * - Rút từ 5 xuống 2 giá trị 2026-07-31 (`0068`/`0071`), rồi khôi phục điểm kết thúc 2026-08-24
 *   (`docs/decisions/production-lifecycle-closing.md`) — `WAITING_QC`/`WAITING_DELIVERY`/
 *   `COMPLETED` tự động theo tiến độ QC + nhập kho thành phẩm, không có route tay nào set thẳng.
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
 * Job sản xuất — 1 sản phẩm (FG) = 1 Job trong một LSX. Số lượng gộp từ mọi dòng
 * `production_order_items` cùng `itemId` trong cùng LSX — khác tầng quyết định sản xuất, tầng
 * này không giữ 1-1 với `orderItemId` vì Job là đơn vị công việc thực tế của xưởng, không phải
 * đơn vị kế toán kho. Đường ghi từng sinh Job ("Tạo LSX" phát hành,
 * `ProductionOrdersService.issueProductionOrders`) đã bỏ 2026-07-30; sống lại cùng ngày qua
 * `ProductionJobsService.createJobs`, gọi từ `ProductionOrdersService.approveProductionOrder`
 * (chốt LSX sang `APPROVED`) thay vì phát hành — xem `docs/domains/production.md`.
 *
 * Rules:
 * - `status` thêm 2026-07-30 — vòng đời ở mức Job; tiến độ **theo từng công đoạn** đọc riêng qua
 *   `productionJobOperations.completedQuantity`/`completedDate` (`docs/domains/production.md`),
 *   `createJobs` đã snapshot công đoạn (`productionJobOperations`) + vật tư (`productionJobIssues`).
 * - `producedQty`/`rejectedQty` (báo sản lượng cộng dồn) và `cancelledBy`/`cancelledAt`/
 *   `cancelReason` vẫn chưa có — Job hiện không còn cách nào qua API để ghi nhận sản lượng đạt/phế
 *   hay huỷ. Tạm hoãn, xem `docs/domains/production.md` (mở rộng lại khi xưởng cần).
 * - `completedBy`/`completedAt` khôi phục 2026-08-24 (từng bị xoá cùng đợt rút enum 2026-07-31) —
 *   ghi khi `status → COMPLETED` (`InventoryReceiptsService.postInventoryReceipt`, không có route
 *   tay), xem `docs/decisions/production-lifecycle-closing.md`.
 * - `operationsApprovedBy`/`operationsApprovedAt` thêm 2026-08-25, ghi bởi
 *   `POST .../approve-operations` — route đó đã xoá 2026-09-03 (bỏ bước duyệt công đoạn riêng,
 *   `POST /production-execution/operations/:jobOperationId/reports` mở ngay khi Job
 *   `IN_PROGRESS`). Giữ cột lại cho dữ liệu cũ, không còn route nào ghi. Xem
 *   `docs/domains/production.md`.
 * - Lịch sử thao tác Job ở `production_job_logs` (bảng riêng, append-only), không ở bảng này —
 *   chỉ `startedBy`/`startedAt`/`completedBy`/`completedAt` là cột thật; 2 mốc `WAITING_QC`/
 *   `WAITING_DELIVERY` cố ý không có cột người/thời điểm riêng, xem `docs/domains/production.md`.
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
