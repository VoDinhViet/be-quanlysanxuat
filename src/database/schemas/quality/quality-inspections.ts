import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  numeric,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { departments } from '../departments';
import { items } from '../items/items';
import { productionJobOperations } from '../production/production-job-operations';
import { productionJobs } from '../production/production-jobs';
import { purchaseOrders } from '../purchasing/purchase-orders';
import { suppliers } from '../suppliers/suppliers';
import { clients } from '../clients/clients';
import { users } from '../identity-access/users';
// Tạm import từ `qc-requests.ts` (còn tồn tại song song tới khi dọn ở bước cuối migration) — tránh
// khai trùng tên export `IqcDisposition`/`OqcDisposition` qua `export *` ở `schemas/index.ts`.
import { IqcDisposition, OqcDisposition } from './qc-requests';
import {
  qcInspectionLevelEnum,
  qualityDispositionEnum,
  qualityInspectionDecisionEnum,
  qualityInspectionOriginTypeEnum,
  qualityInspectionStatusEnum,
  qualityInspectionTypeEnum,
  QualityInspectionOriginType,
  QualityInspectionStatus,
} from './quality-enums';

/**
 * Rename/tái cấu trúc của `qc_requests` — thay `kind`/`INCOMING`/`OUTGOING` bằng
 * `inspectionType`/`IQC`/`OQC`, `origin_type`+`origin_id` (polymorphic, không FK — validate ở
 * service) thay 3 cột chứng từ nguồn cũ (`inventoryReceiptId`/`outsourcingReceiptId`/
 * `outsourcingReceiptItemId`). `purchaseOrderId`/`supplierId`/`clientId`/`productionJobId`/
 * `productionJobOperationId` giữ nguyên làm FK thật — không gộp được vào origin, xem plan migration
 * ("Phát hiện quan trọng"). Mọi bất biến/comment khác kế thừa nguyên văn từ `qc-requests.ts`.
 */
export const qualityInspections = pgTable(
  'quality_inspections',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    inspectionNo: varchar('inspection_no', { length: 50 }).notNull().unique(),
    inspectionType: qualityInspectionTypeEnum('inspection_type').notNull(),

    // Chứng từ nguồn (polymorphic) — thay inventoryReceiptId/outsourcingReceiptId/
    // outsourcingReceiptItemId. `outsourcingReceiptId` không còn cột riêng, suy qua join
    // outsourcing_receipt_items ở service khi cần.
    originType: qualityInspectionOriginTypeEnum('origin_type')
      .notNull()
      .default(QualityInspectionOriginType.MANUAL),
    originId: uuid('origin_id'),

    purchaseOrderId: uuid('purchase_order_id').references(
      () => purchaseOrders.id,
      { onDelete: 'set null' },
    ),
    supplierId: uuid('supplier_id').references(() => suppliers.id, {
      onDelete: 'restrict',
    }),
    clientId: uuid('client_id').references(() => clients.id, {
      onDelete: 'restrict',
    }),
    productionJobId: uuid('production_job_id').references(
      () => productionJobs.id,
      { onDelete: 'restrict' },
    ),
    productionJobOperationId: uuid('production_job_operation_id').references(
      () => productionJobOperations.id,
      { onDelete: 'restrict' },
    ),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'restrict' }),
    quantity: numeric('quantity', {
      precision: 18,
      scale: 3,
      mode: 'number',
    }).notNull(),
    requestedAt: timestamp('requested_at').notNull(),
    inspectionLevel: qcInspectionLevelEnum('inspection_level'),
    aqlLevel: numeric('aql_level', { precision: 4, scale: 2, mode: 'number' }),
    sampleSize: integer('sample_size'),
    defectQty: integer('defect_qty'),
    decision: qualityInspectionDecisionEnum('decision'),
    disposition: qualityDispositionEnum('disposition').$type<
      IqcDisposition | OqcDisposition
    >(),
    status: qualityInspectionStatusEnum('status')
      .notNull()
      .default(QualityInspectionStatus.DRAFT),
    reason: varchar('reason', { length: 255 }),
    note: varchar('note', { length: 1000 }),
    decisionNote: varchar('decision_note', { length: 500 }),
    dispositionNote: varchar('disposition_note', { length: 500 }),
    inspectionStandard: varchar('inspection_standard', { length: 100 }),
    inspectorName: varchar('inspector_name', { length: 100 }),
    measuringTools: varchar('measuring_tools', { length: 255 }),
    inspectedBy: uuid('inspected_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    startedAt: timestamp('started_at'),
    approvedBy: uuid('approved_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    approvedAt: timestamp('approved_at'),
    // Để dành — chưa có đường ghi đợt này, giữ vì có trong thiết kế gốc.
    completedAt: timestamp('completed_at'),
    qcDepartmentId: uuid('qc_department_id').references(() => departments.id, {
      onDelete: 'set null',
    }),
    sortOkQty: numeric('sort_ok_qty', {
      precision: 18,
      scale: 3,
      mode: 'number',
    }),
    sortNgQty: numeric('sort_ng_qty', {
      precision: 18,
      scale: 3,
      mode: 'number',
    }),
    attemptCount: integer('attempt_count').notNull().default(0),
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
    index('idx_quality_inspections_origin').on(
      table.originType,
      table.originId,
    ),
    index('idx_quality_inspections_purchase_order_id').on(
      table.purchaseOrderId,
    ),
    index('idx_quality_inspections_supplier_id').on(table.supplierId),
    index('idx_quality_inspections_client_id').on(table.clientId),
    index('idx_quality_inspections_production_job_id').on(
      table.productionJobId,
    ),
    index('idx_quality_inspections_production_job_operation_id').on(
      table.productionJobOperationId,
    ),
    index('idx_quality_inspections_item_id').on(table.itemId),
    index('idx_quality_inspections_type').on(table.inspectionType),
    index('idx_quality_inspections_status').on(table.status),
    index('idx_quality_inspections_decision').on(table.decision),
    index('idx_quality_inspections_disposition').on(table.disposition),
    index('idx_quality_inspections_requested_at').on(table.requestedAt),
    index('idx_quality_inspections_created_by').on(table.createdBy),
    index('idx_quality_inspections_qc_department_id').on(table.qcDepartmentId),
    index('idx_quality_inspections_inspected_by').on(table.inspectedBy),
    index('idx_quality_inspections_approved_by').on(table.approvedBy),
    // (id, inspection_type) — composite FK từ supplier_returns.qualityInspectionId.
    uniqueIndex('uq_quality_inspections_id_type').on(
      table.id,
      table.inspectionType,
    ),
    // (id, inspection_type, quantity) — composite FK 3 cột từ quality_inspection_results, giữ cho
    // 2 CHECK cross-nhánh (disposition_requires_fail/sort_qty_total) viết được trên bảng attempt.
    uniqueIndex('uq_quality_inspections_id_type_quantity').on(
      table.id,
      table.inspectionType,
      table.quantity,
    ),
    check('chk_quality_inspections_quantity_positive', sql`quantity > 0`),
    check(
      'chk_quality_inspections_sample_size_positive',
      sql`sample_size IS NULL OR sample_size > 0`,
    ),
    check(
      'chk_quality_inspections_defect_qty_non_negative',
      sql`defect_qty IS NULL OR defect_qty >= 0`,
    ),
    check(
      'chk_quality_inspections_aql_level_positive',
      sql`aql_level IS NULL OR aql_level > 0`,
    ),
    check(
      'chk_quality_inspections_disposition_requires_fail',
      sql`disposition IS NULL OR decision = 'FAIL'`,
    ),
    check(
      'chk_quality_inspections_sort_qty_pair',
      sql`(sort_ok_qty IS NULL AND sort_ng_qty IS NULL) OR (sort_ok_qty IS NOT NULL AND sort_ng_qty IS NOT NULL AND sort_ok_qty >= 0 AND sort_ng_qty >= 0)`,
    ),
    check(
      'chk_quality_inspections_sort_qty_requires_sort',
      sql`(sort_ok_qty IS NULL AND sort_ng_qty IS NULL) OR disposition = 'SORT'`,
    ),
    check(
      'chk_quality_inspections_sort_qty_total',
      sql`sort_ok_qty IS NULL OR sort_ok_qty + sort_ng_qty = quantity`,
    ),
    // Thay chk_qc_requests_source_exclusive/outsourcing_item — origin chỉ giữ 1 giá trị nên tự
    // loại trừ; MANUAL bắt buộc origin_id NULL, 2 loại còn lại bắt buộc khác NULL.
    check(
      'chk_quality_inspections_origin_id_pair',
      sql`(origin_type = 'MANUAL') = (origin_id IS NULL)`,
    ),
    check(
      'chk_quality_inspections_oqc_no_supplier',
      sql`inspection_type <> 'OQC' OR supplier_id IS NULL`,
    ),
    check(
      'chk_quality_inspections_oqc_no_client',
      sql`inspection_type <> 'OQC' OR client_id IS NULL`,
    ),
    check(
      'chk_quality_inspections_supplier_client_exclusive',
      sql`NOT (supplier_id IS NOT NULL AND client_id IS NOT NULL)`,
    ),
    check(
      'chk_quality_inspections_oqc_no_iqc_fields',
      sql`inspection_type <> 'OQC' OR (
        reason IS NULL AND inspection_standard IS NULL AND inspector_name IS NULL
        AND measuring_tools IS NULL AND qc_department_id IS NULL
        AND sort_ok_qty IS NULL AND sort_ng_qty IS NULL
      )`,
    ),
    check(
      'chk_quality_inspections_oqc_job',
      sql`inspection_type <> 'OQC' OR (production_job_id IS NOT NULL AND production_job_operation_id IS NOT NULL)`,
    ),
    // Yếu hơn `chk_qc_requests_status_by_kind` cũ — IQC/OQC dùng chung 1 tập giá trị `status` sau
    // khi gộp WAITING_RETURN/REWORK thành IN_PROGRESS, DB không còn tự phân biệt được 2 kind ở cột
    // này; chỉ còn chặn giá trị CANCELLED để dành. Phân biệt IQC-không-bao-giờ-REWORK giữ ở service.
    check('chk_quality_inspections_status_in_use', sql`status <> 'CANCELLED'`),
    check(
      'chk_quality_inspections_decision_in_use',
      sql`decision IS NULL OR decision IN ('PASS','FAIL')`,
    ),
    check(
      'chk_quality_inspections_attempt_count_non_negative',
      sql`attempt_count >= 0`,
    ),
  ],
);

export type QualityInspectionSelect = typeof qualityInspections.$inferSelect;
