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
import { productionJobOperations } from '../production/production-job-operations';
import { productionJobs } from '../production/production-jobs';
import { users } from '../identity-access/users';
import { iqcInspectionLevelEnum, iqcResultEnum } from './iqc-inspections';

/**
 * `NOT_INSPECTED` → chưa gửi `result`, chờ QC lưu kết quả qua `POST /oqc/:oqcId/confirm`.
 * `PENDING` → FAIL, chưa có `disposition`. `REWORK` → FAIL, `disposition = REWORK` — phiếu vẫn mở,
 * QC kiểm lại trên chính phiếu tới khi PASS. `COMPLETED` → PASS, hoặc FAIL với `disposition =
 * ACCEPT`/`SCRAP` — **khoá cứng** (`E177`, không confirm lại được nữa — khác `IqcStatus.COMPLETED`,
 * vẫn confirm lại được) vì đây là mốc dùng để tính điều kiện mở khoá nhập kho thành phẩm
 * (`docs/domains/inventory.md`, "Gate nhập kho thành phẩm"). Xem `docs/domains/quality.md`.
 */
export enum OqcStatus {
  NOT_INSPECTED = 'NOT_INSPECTED',
  PENDING = 'PENDING',
  REWORK = 'REWORK',
  COMPLETED = 'COMPLETED',
}

export const oqcStatusEnum = pgEnum('oqc_status', [
  OqcStatus.NOT_INSPECTED,
  OqcStatus.PENDING,
  OqcStatus.REWORK,
  OqcStatus.COMPLETED,
]);

/**
 * Cách xử lý khi `result = FAIL` — không dùng chung `IqcDisposition` (CONCESSION/SORT/RETURN) vì
 * OQC là QC nội bộ sản xuất, không có NCC để trả hàng. `ACCEPT` — chấp nhận đặc biệt, dùng tiếp dù
 * có lỗi (≈ `CONCESSION`). `REWORK` — trả xưởng sửa lại, phiếu vẫn mở. `SCRAP` — loại bỏ hẳn, giải
 * phóng lại quota lô của công đoạn (không tính vào `E176`). Chỉ có ý nghĩa khi `result = FAIL`
 * (`chk_oqc_inspections_disposition_requires_fail`).
 */
export enum OqcDisposition {
  ACCEPT = 'ACCEPT',
  REWORK = 'REWORK',
  SCRAP = 'SCRAP',
}

export const oqcDispositionEnum = pgEnum('oqc_disposition', [
  OqcDisposition.ACCEPT,
  OqcDisposition.REWORK,
  OqcDisposition.SCRAP,
]);

/**
 * Kiểm chất lượng OQC — Outgoing/Final QC, trước khi cho nhập kho — bảng phẳng, 1 dòng = 1 lô kiểm
 * của **1 công đoạn** (`production_job_operations`, công đoạn as-used của 1 node WIP trong cây BOM
 * của Job), độc lập hoàn toàn với `iqc_inspections` (kiểm hàng nhập — vật tư từ NCC). Đổi từ gắn
 * theo cả Job sang gắn theo công đoạn — xem `docs/decisions/oqc-per-operation.md`.
 *
 * `productionJobId`/`productionJobOperationId` bắt buộc (`NOT NULL`, `restrict`) — LSX một khi
 * `APPROVED` không có đường nào xoá được cây Job/công đoạn của nó nữa
 * (`ensureItemsNotLockedByProduction`), nên hai FK này không cần phòng hờ mồ côi; mã/tên công đoạn
 * và node BOM không lưu cột riêng, đọc thẳng qua relation lúc `GET`.
 * `productionJobId` denormalize từ `operation.productionJobId`, server tự set — giữ để
 * lọc/join theo Job không phải qua `production_job_operations`. `itemId` NOT NULL, snapshot từ
 * `bomItem.itemId` của node chứa công đoạn — node mất `itemId` (`set null`, item gốc bị xoá) thì
 * không tạo được OQC (`E199`). `quantity` (lot size) luôn QC nhập tay, chặn không vượt
 * `completedQuantity` của chính công đoạn đó (`E198`) — `production_jobs` không lưu sản lượng thực
 * tế cấp Job. Xem `docs/domains/quality.md`.
 */
export const oqcInspections = pgTable(
  'oqc_inspections',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: varchar('code', { length: 50 }).notNull().unique(),
    productionJobId: uuid('production_job_id')
      .notNull()
      .references(() => productionJobs.id, { onDelete: 'restrict' }),
    productionJobOperationId: uuid('production_job_operation_id')
      .notNull()
      .references(() => productionJobOperations.id, { onDelete: 'restrict' }),
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
    // Kết quả AQL server tự suy tại lần lưu gần nhất (`defectQty` so `ac`/`re`) — `result` có thể
    // lệch giá trị này nếu QC chủ động ghi đè (bắt buộc kèm `resultNote` khi đó, `E201`). Không
    // nguỵ tạo cho dữ liệu cũ trước đợt AQL auto — để `NULL`.
    resultAuto: iqcResultEnum('result_auto'),
    disposition: oqcDispositionEnum('disposition'),
    status: oqcStatusEnum('status').notNull().default(OqcStatus.NOT_INSPECTED),
    resultNote: varchar('result_note', { length: 500 }),
    dispositionNote: varchar('disposition_note', { length: 500 }),
    note: varchar('note', { length: 1000 }),
    confirmedBy: uuid('confirmed_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    confirmedAt: timestamp('confirmed_at'),
    resolvedBy: uuid('resolved_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    resolvedAt: timestamp('resolved_at'),
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
    index('idx_oqc_inspections_production_job_operation_id').on(
      table.productionJobOperationId,
    ),
    index('idx_oqc_inspections_item_id').on(table.itemId),
    index('idx_oqc_inspections_status').on(table.status),
    index('idx_oqc_inspections_disposition').on(table.disposition),
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
    check(
      'chk_oqc_inspections_disposition_requires_fail',
      sql`disposition IS NULL OR result = 'FAIL'`,
    ),
  ],
);

export const oqcInspectionsRelations = relations(oqcInspections, ({ one }) => ({
  productionJob: one(productionJobs, {
    fields: [oqcInspections.productionJobId],
    references: [productionJobs.id],
  }),
  productionJobOperation: one(productionJobOperations, {
    fields: [oqcInspections.productionJobOperationId],
    references: [productionJobOperations.id],
  }),
  item: one(items, {
    fields: [oqcInspections.itemId],
    references: [items.id],
  }),
  confirmerBy: one(users, {
    fields: [oqcInspections.confirmedBy],
    references: [users.id],
  }),
  resolverBy: one(users, {
    fields: [oqcInspections.resolvedBy],
    references: [users.id],
  }),
  creatorBy: one(users, {
    fields: [oqcInspections.createdBy],
    references: [users.id],
  }),
}));

export type OqcInspectionSelect = typeof oqcInspections.$inferSelect;
