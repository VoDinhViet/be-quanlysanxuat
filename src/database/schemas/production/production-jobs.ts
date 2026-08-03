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

import { products } from '../products/products';
import { productionJobBomItems } from './production-job-bom-items';
import { productionJobMaterials } from './production-job-materials';
import { productionJobNotes } from './production-job-notes';
import { productionOrders } from './production-orders';
import { users } from '../identity-access/users';

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
 *   `createJobs` đã snapshot công đoạn (`productionJobOperations`) + vật tư (`productionJobMaterials`),
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
    bomItems: many(productionJobBomItems),
    materials: many(productionJobMaterials),
    notes: many(productionJobNotes),
  }),
);
