import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { departments } from '../departments';
import { inventoryReceipts } from '../inventory/inventory-receipts';
import { outsourcingReceiptItems } from '../inventory/outsourcing-receipt-items';
import { outsourcingReceipts } from '../inventory/outsourcing-receipts';
import { items } from '../items/items';
import { productionJobOperations } from '../production/production-job-operations';
import { productionJobs } from '../production/production-jobs';
import { purchaseOrders } from '../purchasing/purchase-orders';
import { suppliers } from '../suppliers/suppliers';
import { users } from '../identity-access/users';

/**
 * `INCOMING` — kiểm hàng nhập từ NCC (IQC cũ). `OUTGOING` — kiểm công đoạn sản xuất, kể cả công
 * đoạn gia công ngoài (OQC cũ, gộp `type = OUTSOURCE` vào từ `docs/decisions/qc-single-table.md`).
 * Discriminator quyết định cột nào bắt buộc (`chk_quality_inspections_incoming_supplier`/`chk_quality_inspections_outgoing_job`...) —
 * xem doc đó cho lý do gộp một bảng thay vì cha–con.
 */
export enum QcKind {
  INCOMING = 'INCOMING',
  OUTGOING = 'OUTGOING',
}

export const qcKindEnum = pgEnum('qc_kind', [QcKind.INCOMING, QcKind.OUTGOING]);

export enum IqcResult {
  PASS = 'PASS',
  FAIL = 'FAIL',
}

export const qcResultEnum = pgEnum('qc_result', [
  IqcResult.PASS,
  IqcResult.FAIL,
]);

export enum IqcInspectionLevel {
  I = 'I',
  II = 'II',
  III = 'III',
}

export const qcInspectionLevelEnum = pgEnum('qc_inspection_level', [
  IqcInspectionLevel.I,
  IqcInspectionLevel.II,
  IqcInspectionLevel.III,
]);

/**
 * Chỉ có ý nghĩa khi `result = FAIL` (`chk_quality_inspections_disposition_requires_fail`). Giá trị hợp lệ khác
 * nhau theo `kind` (`chk_quality_inspections_disposition_by_kind`) — `INCOMING` dùng `IqcDisposition`, `OUTGOING`
 * dùng `OqcDisposition`; cột vật lý dùng chung `qc_disposition` (union Postgres enum của cả hai).
 */
export enum IqcDisposition {
  CONCESSION = 'CONCESSION',
  SORT = 'SORT',
  RETURN = 'RETURN',
}

export enum OqcDisposition {
  ACCEPT = 'ACCEPT',
  REWORK = 'REWORK',
  SCRAP = 'SCRAP',
}

export const qcDispositionEnum = pgEnum('qc_disposition', [
  IqcDisposition.CONCESSION,
  IqcDisposition.SORT,
  IqcDisposition.RETURN,
  OqcDisposition.ACCEPT,
  OqcDisposition.REWORK,
  OqcDisposition.SCRAP,
]);

/**
 * `NOT_INSPECTED` → chưa gửi `result`. `PENDING` → FAIL chưa có `disposition`. `WAITING_RETURN`
 * (chỉ `INCOMING`) → FAIL, `disposition` SORT/RETURN, khoá cứng (`E159`) tới khi phiếu trả NCC tự
 * sinh được `post`. `REWORK` (chỉ `OUTGOING`) → FAIL, `disposition = REWORK`, phiếu vẫn mở. Giá trị
 * hợp lệ theo `kind`: `chk_quality_inspections_status_by_kind`. `COMPLETED` → PASS, hoặc FAIL với disposition không
 * cần xử lý thêm (`CONCESSION`/`ACCEPT`/`SCRAP`) — `INCOMING.COMPLETED` vẫn `confirm` lại được,
 * `OUTGOING.COMPLETED` khoá cứng (`E177`, mốc gate nhập kho/giao hàng) — khác biệt cố ý giữa hai
 * `kind`, xem `docs/domains/quality.md`.
 */
export enum IqcStatus {
  NOT_INSPECTED = 'NOT_INSPECTED',
  PENDING = 'PENDING',
  WAITING_RETURN = 'WAITING_RETURN',
  COMPLETED = 'COMPLETED',
}

export enum OqcStatus {
  NOT_INSPECTED = 'NOT_INSPECTED',
  PENDING = 'PENDING',
  REWORK = 'REWORK',
  COMPLETED = 'COMPLETED',
}

export const qcStatusEnum = pgEnum('qc_status', [
  IqcStatus.NOT_INSPECTED,
  IqcStatus.PENDING,
  IqcStatus.WAITING_RETURN,
  OqcStatus.REWORK,
  IqcStatus.COMPLETED,
]);

/**
 * QC hợp nhất — `kind = INCOMING` (kiểm hàng nhập từ NCC, IQC cũ) hoặc `OUTGOING` (kiểm công đoạn
 * sản xuất, OQC cũ). Bảng phẳng + discriminator, không cha–con — lý do đầy đủ:
 * `docs/decisions/qc-single-table.md`. `IqcService`/`OqcService` (2 module riêng, không đổi route)
 * đều đọc/ghi bảng này, luôn kèm `eq(kind, ...)`.
 *
 * Cột riêng `INCOMING`: `supplierId`/`inventoryReceiptId`/`outsourcingReceiptId`/
 * `outsourcingReceiptItemId`/`purchaseOrderId` (chứng từ nguồn, tối đa một cặp mua/gia công ngoài
 * khác `null` — `chk_quality_inspections_source_exclusive`), `reason`, `inspectionStandard`/`inspectorName`/
 * `measuringTools`, `qcDepartmentId`, `sortOkQty`/`sortNgQty`.
 *
 * Cột neo sản xuất `productionJobId`/`productionJobOperationId` dùng chung cả hai `kind`:
 * `OUTGOING` bắt buộc có (`chk_quality_inspections_outgoing_job`); `INCOMING` có khi phiếu sinh từ OS-IN (server suy
 * qua `outsourcingReceiptItem → outsourcingOrderItem`), `NULL` khi là hàng mua thường.
 */
export const qualityInspections = pgTable(
  'quality_inspections',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: varchar('code', { length: 50 }).notNull().unique(),
    kind: qcKindEnum('kind').notNull(),
    // INCOMING — chứng từ nguồn, tối đa một cặp khác null (chk_quality_inspections_source_exclusive).
    inventoryReceiptId: uuid('inventory_receipt_id').references(
      () => inventoryReceipts.id,
      { onDelete: 'set null' },
    ),
    outsourcingReceiptId: uuid('outsourcing_receipt_id').references(
      () => outsourcingReceipts.id,
      { onDelete: 'set null' },
    ),
    outsourcingReceiptItemId: uuid('outsourcing_receipt_item_id').references(
      () => outsourcingReceiptItems.id,
      { onDelete: 'set null' },
    ),
    purchaseOrderId: uuid('purchase_order_id').references(
      () => purchaseOrders.id,
      { onDelete: 'set null' },
    ),
    supplierId: uuid('supplier_id').references(() => suppliers.id, {
      onDelete: 'restrict',
    }),
    // Neo sản xuất — bắt buộc khi OUTGOING (chk_quality_inspections_outgoing_job), tuỳ chọn khi INCOMING (có giá
    // trị nếu phiếu sinh từ OS-IN, server tự suy qua outsourcingReceiptItem).
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
    // Thời điểm kiểm thực tế — set lúc tạo, sửa lại được qua confirm (OUTGOING) hoặc confirm/PATCH
    // (INCOMING).
    inspectionDate: timestamp('inspection_date').notNull(),
    inspectionLevel: qcInspectionLevelEnum('inspection_level'),
    aqlLevel: numeric('aql_level', { precision: 4, scale: 2, mode: 'number' }),
    sampleSize: integer('sample_size'),
    defectQty: integer('defect_qty'),
    result: qcResultEnum('result'),
    // Chỉ OUTGOING dùng — server tự suy từ Ac/Re (resolveAqlResult), luôn NULL ở INCOMING.
    resultAuto: qcResultEnum('result_auto'),
    // `.$type<>()` — `IqcDisposition`/`OqcDisposition` là 2 enum TS riêng (giá trị Postgres không
    // giao nhau) nên giá trị suy mặc định từ mảng `qcDispositionEnum` (trộn cả hai) chỉ còn là
    // union kiểu string thô; ép lại thành union 2 enum TS để `IqcService`/`OqcService` so sánh
    // đúng kiểu enum của module mình, không phải string.
    disposition: qcDispositionEnum('disposition').$type<
      IqcDisposition | OqcDisposition
    >(),
    // Cùng lý do `.$type<>()` như `disposition` — xem comment trên.
    status: qcStatusEnum('status')
      .$type<IqcStatus | OqcStatus>()
      .notNull()
      .default(IqcStatus.NOT_INSPECTED),
    // INCOMING — hiện chung ô "PO / Lý do" trên FE khi không có purchaseOrderId.
    reason: varchar('reason', { length: 255 }),
    note: varchar('note', { length: 1000 }),
    resultNote: varchar('result_note', { length: 500 }),
    dispositionNote: varchar('disposition_note', { length: 500 }),
    // INCOMING — tiêu chuẩn kiểm (vd "VT-0152 Rev.02") — text tự do, không tra bảng danh mục.
    inspectionStandard: varchar('inspection_standard', { length: 100 }),
    // INCOMING — tên người kiểm thực tế ngoài xưởng, tách biệt confirmedBy (tài khoản bấm Lưu).
    inspectorName: varchar('inspector_name', { length: 100 }),
    measuringTools: varchar('measuring_tools', { length: 255 }),
    confirmedBy: uuid('confirmed_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    confirmedAt: timestamp('confirmed_at'),
    resolvedBy: uuid('resolved_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    resolvedAt: timestamp('resolved_at'),
    // INCOMING — bộ phận QC đã kiểm, FK master data thật (khác inspectorName, text tự do).
    qcDepartmentId: uuid('qc_department_id').references(() => departments.id, {
      onDelete: 'set null',
    }),
    // INCOMING — tách OK/NG khi disposition = SORT, luôn cùng NULL hay cùng có giá trị
    // (chk_quality_inspections_sort_qty_pair), cộng lại đúng quantity (chk_quality_inspections_sort_qty_total).
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
    index('idx_quality_inspections_inventory_receipt_id').on(
      table.inventoryReceiptId,
    ),
    index('idx_quality_inspections_outsourcing_receipt_id').on(
      table.outsourcingReceiptId,
    ),
    index('idx_quality_inspections_outsourcing_receipt_item_id').on(
      table.outsourcingReceiptItemId,
    ),
    index('idx_quality_inspections_purchase_order_id').on(
      table.purchaseOrderId,
    ),
    index('idx_quality_inspections_supplier_id').on(table.supplierId),
    index('idx_quality_inspections_production_job_id').on(
      table.productionJobId,
    ),
    index('idx_quality_inspections_production_job_operation_id').on(
      table.productionJobOperationId,
    ),
    index('idx_quality_inspections_item_id').on(table.itemId),
    index('idx_quality_inspections_kind').on(table.kind),
    index('idx_quality_inspections_status').on(table.status),
    index('idx_quality_inspections_result').on(table.result),
    index('idx_quality_inspections_disposition').on(table.disposition),
    index('idx_quality_inspections_inspection_date').on(table.inspectionDate),
    index('idx_quality_inspections_created_by').on(table.createdBy),
    index('idx_quality_inspections_qc_department_id').on(table.qcDepartmentId),
    // (id, kind) — composite FK từ supplier_returns.iqcId, xem chk_supplier_returns_qc_kind.
    uniqueIndex('uq_quality_inspections_id_kind').on(table.id, table.kind),
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
      'chk_quality_inspections_aql_level_valid',
      sql`aql_level IS NULL OR aql_level = ANY(ARRAY[0.65,1.0,1.5,2.5,4.0,6.5])`,
    ),
    // Bất biến nghiệp vụ: chỉ hàng FAIL mới có quyết định xử lý. Service còn kiểm lại (E139/E202)
    // trước khi ghi — CHECK này là chốt chặn cuối, phòng ai ghi thẳng qua SQL.
    check(
      'chk_quality_inspections_disposition_requires_fail',
      sql`disposition IS NULL OR result = 'FAIL'`,
    ),
    check(
      'chk_quality_inspections_sort_qty_pair',
      sql`(sort_ok_qty IS NULL AND sort_ng_qty IS NULL) OR (sort_ok_qty IS NOT NULL AND sort_ng_qty IS NOT NULL AND sort_ok_qty >= 0 AND sort_ng_qty >= 0)`,
    ),
    check(
      'chk_quality_inspections_sort_qty_requires_sort',
      sql`(sort_ok_qty IS NULL AND sort_ng_qty IS NULL) OR disposition = 'SORT'`,
    ),
    // So bằng — cả 3 cột đều numeric, không phải float, nên phép cộng này chính xác tuyệt đối.
    check(
      'chk_quality_inspections_sort_qty_total',
      sql`sort_ok_qty IS NULL OR sort_ok_qty + sort_ng_qty = quantity`,
    ),
    // Không thể vừa mua vừa gia công ngoài trên cùng một dòng QC.
    check(
      'chk_quality_inspections_source_exclusive',
      sql`NOT (inventory_receipt_id IS NOT NULL AND outsourcing_receipt_id IS NOT NULL)`,
    ),
    check(
      'chk_quality_inspections_outsourcing_item',
      sql`outsourcing_receipt_item_id IS NULL OR outsourcing_receipt_id IS NOT NULL`,
    ),
    check(
      'chk_quality_inspections_incoming_supplier',
      sql`kind <> 'INCOMING' OR supplier_id IS NOT NULL`,
    ),
    check(
      'chk_quality_inspections_outgoing_no_supplier',
      sql`kind <> 'OUTGOING' OR supplier_id IS NULL`,
    ),
    check(
      'chk_quality_inspections_outgoing_job',
      sql`kind <> 'OUTGOING' OR (production_job_id IS NOT NULL AND production_job_operation_id IS NOT NULL)`,
    ),
    check(
      'chk_quality_inspections_status_by_kind',
      sql`(kind = 'INCOMING' AND status IN ('NOT_INSPECTED','PENDING','WAITING_RETURN','COMPLETED'))
          OR (kind = 'OUTGOING' AND status IN ('NOT_INSPECTED','PENDING','REWORK','COMPLETED'))`,
    ),
    check(
      'chk_quality_inspections_disposition_by_kind',
      sql`disposition IS NULL
          OR (kind = 'INCOMING' AND disposition IN ('CONCESSION','SORT','RETURN'))
          OR (kind = 'OUTGOING' AND disposition IN ('ACCEPT','REWORK','SCRAP'))`,
    ),
  ],
);

// `qualityInspectionsRelations` sống ở `quality-inspections-relations.ts`, không phải file này —
// nó cần `supplierReturns` (`../inventory/supplier-returns`), mà `supplier_returns` lại cần
// `qualityInspections` NGAY LÚC module-load (composite FK `(iqc_id, qc_kind)`, không phải thunk
// lazy như `.references(() => ...)`) — import `supplierReturns` thẳng ở đây tạo vòng lặp module
// thật (`ReferenceError: Cannot access 'qcKindEnum' before initialization`), không phải kiểu vòng
// lặp vô hại qua `relations()` callback như các bảng khác. Tách ra một file riêng để
// `quality-inspections.ts` không có cạnh nào quay lại `supplier-returns.ts`.

export type QualityInspectionSelect = typeof qualityInspections.$inferSelect;
