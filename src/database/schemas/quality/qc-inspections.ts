import { relations, sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
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
import { users } from '../identity-access/users';
import { qcAqlPlans } from './qc-aql-plans';
import { qcAqlRules } from './qc-aql-rules';
import { qcFiles } from './qc-files';
import {
  IqcDisposition,
  IqcStatus,
  OqcDisposition,
  OqcStatus,
  qcDispositionEnum,
  qcInspectionLevelEnum,
  qcKindEnum,
  qcRequests,
  qcResultEnum,
  qcStatusEnum,
} from './qc-requests';

/**
 * Một **lần kiểm** (attempt) của một `qc_requests` — append-only, không bao giờ `UPDATE`. Mỗi lần
 * QC bấm "Lưu" (`IqcService.confirmIqc`/`OqcService.confirmOqc`) sinh 1 dòng mới, vá lỗ hổng cũ:
 * trước đây mỗi lần confirm ghi đè chính dòng `quality_inspections`, PASS ở cuối vòng REWORK xoá
 * sạch lịch sử các lần rework trước — xem `docs/decisions/qc-data-model.md`.
 *
 * `kind`/`quantity` là **mirror của cha**, không phải snapshot độc lập — composite FK 3 cột bên
 * dưới khiến Postgres tự đảm bảo chúng luôn khớp `qc_requests`, nhờ đó 2 CHECK cross-nhánh
 * (`disposition_requires_fail`, `sort_qty_total`) vẫn viết được **trên cùng một bảng vật lý** dù đã
 * tách cha–con — đúng điều kiện mà `docs/decisions/qc-data-model.md` đặt ra khi loại bỏ mô hình
 * cha–con IQC/OQC (trục tách ở đây là request→attempt, không phải trục IQC-vs-OQC mà quyết định đó
 * từng xét).
 *
 * `codeLetter`/`sampleSize`/`acceptanceNumber`/`rejectionNumber`/`aqlPlanId`/`aqlRuleId` snapshot
 * thật lúc tạo, không tính lại lúc đọc — `qc_aql_rules` (Phase B) sửa được qua API, tính lại lúc đọc
 * sẽ đổi ngược Ac/Re hiển thị của các lần kiểm cũ (`docs/decisions/qc-aql-master-data.md`).
 *
 * KHÔNG import file này từ `qc-requests.ts` — composite FK dereference `qcRequests.*` ngay lúc
 * module-load, xem comment cuối file đó.
 */
export const qcInspections = pgTable(
  'qc_inspections',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    // Không dùng `.references()` — composite FK khai tường minh dưới constraint (mang cả kind/
    // quantity để CHECK cross-nhánh viết được, xem doc-comment class).
    qcRequestId: uuid('qc_request_id').notNull(),
    kind: qcKindEnum('kind').notNull(),
    quantity: numeric('quantity', {
      precision: 18,
      scale: 3,
      mode: 'number',
    }).notNull(),

    attemptNo: integer('attempt_no').notNull(),
    inspectionDate: timestamp('inspection_date').notNull(),

    inspectionLevel: qcInspectionLevelEnum('inspection_level'),
    aqlLevel: numeric('aql_level', { precision: 4, scale: 2, mode: 'number' }),
    aqlPlanId: uuid('aql_plan_id').references(() => qcAqlPlans.id, {
      onDelete: 'set null',
    }),
    aqlRuleId: uuid('aql_rule_id').references(() => qcAqlRules.id, {
      onDelete: 'set null',
    }),
    codeLetter: varchar('code_letter', { length: 2 }),
    sampleSize: integer('sample_size'),
    acceptanceNumber: integer('acceptance_number'),
    rejectionNumber: integer('rejection_number'),
    defectQty: integer('defect_qty'),

    // NOT NULL — không có đường ghi nào tạo attempt thiếu result (confirmIqc/confirmOqc đều chốt
    // được result hoặc ném E200 trước khi ghi).
    result: qcResultEnum('result').notNull(),
    resultNote: varchar('result_note', { length: 500 }),

    disposition: qcDispositionEnum('disposition').$type<
      IqcDisposition | OqcDisposition
    >(),
    dispositionNote: varchar('disposition_note', { length: 500 }),
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

    // Ngữ cảnh IQC tại thời điểm attempt — `qc_requests` giữ bản "hiện hành" (sửa được qua PATCH),
    // đây là bản đã dùng lúc kiểm.
    inspectionStandard: varchar('inspection_standard', { length: 100 }),
    inspectorName: varchar('inspector_name', { length: 100 }),
    measuringTools: varchar('measuring_tools', { length: 255 }),
    qcDepartmentId: uuid('qc_department_id').references(() => departments.id, {
      onDelete: 'set null',
    }),

    // `status` mà request nhận NGAY SAU attempt này — thuần audit, không phải nguồn cho gate nào
    // (gate đọc `qc_requests.status`, xem file đó).
    resultingStatus: qcStatusEnum('resulting_status')
      .$type<IqcStatus | OqcStatus>()
      .notNull(),

    confirmedBy: uuid('confirmed_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.qcRequestId, table.kind, table.quantity],
      foreignColumns: [qcRequests.id, qcRequests.kind, qcRequests.quantity],
      name: 'fk_qc_inspections_request',
    })
      .onUpdate('cascade')
      .onDelete('cascade'),

    // Leftmost prefix phủ luôn truy vấn chỉ lọc qc_request_id — không cần index đơn.
    uniqueIndex('uq_qc_inspections_request_id_attempt_no').on(
      table.qcRequestId,
      table.attemptNo,
    ),
    // (id, kind) — cho supplier_returns.qcInspectionId (composite FK trỏ đúng attempt ra quyết
    // định SORT/RETURN).
    uniqueIndex('uq_qc_inspections_id_kind').on(table.id, table.kind),
    index('idx_qc_inspections_result').on(table.result),
    index('idx_qc_inspections_disposition').on(table.disposition),
    index('idx_qc_inspections_confirmed_by').on(table.confirmedBy),
    index('idx_qc_inspections_aql_rule_id').on(table.aqlRuleId),
    index('idx_qc_inspections_aql_plan_id').on(table.aqlPlanId),
    index('idx_qc_inspections_qc_department_id').on(table.qcDepartmentId),

    check('chk_qc_inspections_attempt_no_positive', sql`attempt_no > 0`),
    check('chk_qc_inspections_quantity_positive', sql`quantity > 0`),
    check(
      'chk_qc_inspections_sample_size_positive',
      sql`sample_size IS NULL OR sample_size > 0`,
    ),
    check(
      'chk_qc_inspections_defect_qty_non_negative',
      sql`defect_qty IS NULL OR defect_qty >= 0`,
    ),
    // Cùng lý do `chk_qc_requests_aql_level_positive` — không khoá cứng 6 mức chuẩn, `qc_aql_plans`
    // sửa được qua API (`docs/decisions/qc-aql-master-data.md`).
    check(
      'chk_qc_inspections_aql_level_positive',
      sql`aql_level IS NULL OR aql_level > 0`,
    ),
    check(
      'chk_qc_inspections_ac_re_pair',
      sql`(acceptance_number IS NULL) = (rejection_number IS NULL)`,
    ),
    check(
      'chk_qc_inspections_ac_re_order',
      sql`acceptance_number IS NULL OR rejection_number > acceptance_number`,
    ),
    // === 2 CHECK cross-nhánh, nguyên văn từ `quality_inspections` cũ — xem doc-comment class ===
    check(
      'chk_qc_inspections_disposition_requires_fail',
      sql`disposition IS NULL OR result = 'FAIL'`,
    ),
    check(
      'chk_qc_inspections_sort_qty_total',
      sql`sort_ok_qty IS NULL OR sort_ok_qty + sort_ng_qty = quantity`,
    ),
    check(
      'chk_qc_inspections_sort_qty_pair',
      sql`(sort_ok_qty IS NULL AND sort_ng_qty IS NULL) OR (sort_ok_qty IS NOT NULL AND sort_ng_qty IS NOT NULL AND sort_ok_qty >= 0 AND sort_ng_qty >= 0)`,
    ),
    check(
      'chk_qc_inspections_sort_qty_requires_sort',
      sql`(sort_ok_qty IS NULL AND sort_ng_qty IS NULL) OR disposition = 'SORT'`,
    ),
    check(
      'chk_qc_inspections_disposition_by_kind',
      sql`disposition IS NULL
          OR (kind = 'INCOMING' AND disposition IN ('CONCESSION','SORT','RETURN'))
          OR (kind = 'OUTGOING' AND disposition IN ('ACCEPT','REWORK','SCRAP'))`,
    ),
    check(
      'chk_qc_inspections_resulting_status_by_kind',
      sql`(kind = 'INCOMING' AND resulting_status IN ('NOT_INSPECTED','PENDING','WAITING_RETURN','COMPLETED'))
          OR (kind = 'OUTGOING' AND resulting_status IN ('NOT_INSPECTED','PENDING','REWORK','COMPLETED'))`,
    ),
  ],
);

export const qcInspectionsRelations = relations(
  qcInspections,
  ({ one, many }) => ({
    request: one(qcRequests, {
      fields: [qcInspections.qcRequestId],
      references: [qcRequests.id],
    }),
    aqlPlan: one(qcAqlPlans, {
      fields: [qcInspections.aqlPlanId],
      references: [qcAqlPlans.id],
    }),
    aqlRule: one(qcAqlRules, {
      fields: [qcInspections.aqlRuleId],
      references: [qcAqlRules.id],
    }),
    qcDepartment: one(departments, {
      fields: [qcInspections.qcDepartmentId],
      references: [departments.id],
    }),
    confirmerBy: one(users, {
      fields: [qcInspections.confirmedBy],
      references: [users.id],
    }),
    files: many(qcFiles),
  }),
);

export type QcInspectionSelect = typeof qcInspections.$inferSelect;
