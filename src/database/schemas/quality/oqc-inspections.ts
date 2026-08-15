import { relations, sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { items } from '../items/items';
import { productionJobs } from '../production/production-jobs';
import { users } from '../identity-access/users';
import { iqcInspectionLevelEnum, iqcResultEnum } from './iqc-inspections';

/**
 * `NOT_INSPECTED` → chưa gửi `result`, chờ QC lưu kết quả qua `POST /oqc/:oqcId/confirm`.
 * `PENDING` → FAIL, QC sửa mẫu/kết quả rồi gọi lại `confirm` trên chính phiếu — không có
 * `disposition`/NCR tách nhánh như IQC. `COMPLETED` → PASS, **khoá cứng** (`E177`, không confirm
 * lại được nữa — khác `IqcStatus.COMPLETED`, vẫn confirm lại được) vì đây là mốc mở khoá nhập kho
 * thành phẩm (`docs/domains/inventory.md`, "Gate nhập kho thành phẩm"). Xem
 * `docs/domains/quality.md`.
 */
export enum OqcStatus {
  NOT_INSPECTED = 'NOT_INSPECTED',
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
}

export const oqcStatusEnum = pgEnum('oqc_status', [
  OqcStatus.NOT_INSPECTED,
  OqcStatus.PENDING,
  OqcStatus.COMPLETED,
]);

/**
 * Kiểm chất lượng lô thành phẩm (OQC — Outgoing/Final QC), trước khi cho nhập kho — bảng phẳng,
 * 1 dòng = 1 lô kiểm của 1 Job, độc lập hoàn toàn với `iqc_inspections` (kiểm hàng nhập).
 * `productionJobId` nullable (`set null`) — Job có thể bị hard-delete khi LSX chứa nó được duyệt
 * lại (`ProductionOrdersService.seedPlan`); `itemId` NOT NULL, snapshot từ `job.itemId` lúc tạo,
 * sống sót qua việc Job biến mất vì `items` chỉ xoá mềm. `quantity` (lot size) luôn QC nhập tay —
 * `production_jobs` không lưu sản lượng thực tế. Xem `docs/domains/quality.md`.
 */
export const oqcInspections = pgTable(
  'oqc_inspections',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: varchar('code', { length: 50 }).notNull().unique(),
    productionJobId: uuid('production_job_id').references(
      () => productionJobs.id,
      { onDelete: 'set null' },
    ),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'restrict' }),
    quantity: numeric('quantity', {
      precision: 18,
      scale: 3,
      mode: 'number',
    }).notNull(),
    inspectionDate: timestamp('inspection_date').notNull(),
    inspectionLevel: iqcInspectionLevelEnum('inspection_level'),
    aqlLevel: numeric('aql_level', { precision: 4, scale: 2, mode: 'number' }),
    sampleSize: integer('sample_size'),
    defectQty: integer('defect_qty'),
    result: iqcResultEnum('result'),
    status: oqcStatusEnum('status').notNull().default(OqcStatus.NOT_INSPECTED),
    resultNote: varchar('result_note', { length: 500 }),
    note: varchar('note', { length: 1000 }),
    confirmedBy: uuid('confirmed_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    confirmedAt: timestamp('confirmed_at'),
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
    index('idx_oqc_inspections_production_job_id').on(table.productionJobId),
    index('idx_oqc_inspections_item_id').on(table.itemId),
    index('idx_oqc_inspections_status').on(table.status),
    index('idx_oqc_inspections_inspection_date').on(table.inspectionDate),
    index('idx_oqc_inspections_created_by').on(table.createdBy),
    check('chk_oqc_inspections_quantity_positive', sql`quantity > 0`),
    check(
      'chk_oqc_inspections_sample_size_positive',
      sql`sample_size IS NULL OR sample_size > 0`,
    ),
    check(
      'chk_oqc_inspections_defect_qty_non_negative',
      sql`defect_qty IS NULL OR defect_qty >= 0`,
    ),
    check(
      'chk_oqc_inspections_aql_level_valid',
      sql`aql_level IS NULL OR aql_level = ANY(ARRAY[0.65,1.0,1.5,2.5,4.0,6.5])`,
    ),
  ],
);

export const oqcInspectionsRelations = relations(oqcInspections, ({ one }) => ({
  productionJob: one(productionJobs, {
    fields: [oqcInspections.productionJobId],
    references: [productionJobs.id],
  }),
  item: one(items, {
    fields: [oqcInspections.itemId],
    references: [items.id],
  }),
  confirmerBy: one(users, {
    fields: [oqcInspections.confirmedBy],
    references: [users.id],
  }),
  creatorBy: one(users, {
    fields: [oqcInspections.createdBy],
    references: [users.id],
  }),
}));

export type OqcInspectionSelect = typeof oqcInspections.$inferSelect;
