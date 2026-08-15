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

import { departments } from '../departments';
import { inventoryReceipts } from '../inventory/inventory-receipts';
import { outsourcingReceipts } from '../inventory/outsourcing-receipts';
import { supplierReturns } from '../inventory/supplier-returns';
import { items } from '../items/items';
import { purchaseOrders } from '../purchasing/purchase-orders';
import { suppliers } from '../suppliers/suppliers';
import { users } from '../identity-access/users';
import { iqcAttachments } from './iqc-attachments';

export enum IqcResult {
  PASS = 'PASS',
  FAIL = 'FAIL',
}

export const iqcResultEnum = pgEnum('iqc_result', [
  IqcResult.PASS,
  IqcResult.FAIL,
]);

export enum IqcInspectionLevel {
  I = 'I',
  II = 'II',
  III = 'III',
}

export const iqcInspectionLevelEnum = pgEnum('iqc_inspection_level', [
  IqcInspectionLevel.I,
  IqcInspectionLevel.II,
  IqcInspectionLevel.III,
]);

/**
 * Chỉ có ý nghĩa khi `result = FAIL` (`chk_iqc_inspections_disposition_requires_fail`).
 * CONCESSION (chấp nhận đặc biệt) không cần trả hàng, IQC hoàn thành ngay; SORT (phân loại) và
 * RETURN (trả NCC) đều cần xuất hàng NG ra khỏi kho, IQC chuyển `WAITING_RETURN`.
 */
export enum IqcDisposition {
  CONCESSION = 'CONCESSION',
  SORT = 'SORT',
  RETURN = 'RETURN',
}

export const iqcDispositionEnum = pgEnum('iqc_disposition', [
  IqcDisposition.CONCESSION,
  IqcDisposition.SORT,
  IqcDisposition.RETURN,
]);

/**
 * `NOT_INSPECTED` → chưa gửi `result`, chờ QC lưu kết quả qua `POST /iqc/:iqcId/confirm`.
 * `PENDING` → FAIL chưa có quyết định xử lý. `WAITING_RETURN` → FAIL, `disposition` là SORT/
 * RETURN, `confirm` tự sinh một dòng `supplier_returns` (DRAFT) và khoá dòng IQC này lại (không
 * `confirm` lại được nữa — `E159`) — chỉ chuyển tiếp `COMPLETED` khi phiếu trả đó được `post`
 * (`SupplierReturnsService.postSupplierReturn` → `completeIqcAfterSupplierReturn`). `COMPLETED` →
 * PASS, hoặc FAIL với `disposition = CONCESSION`. Set lúc tạo hoặc lúc confirm
 * (`IqcService.resolveIqcStatus`), xem `docs/domains/quality.md`.
 */
export enum IqcStatus {
  NOT_INSPECTED = 'NOT_INSPECTED',
  PENDING = 'PENDING',
  WAITING_RETURN = 'WAITING_RETURN',
  COMPLETED = 'COMPLETED',
}

export const iqcStatusEnum = pgEnum('iqc_status', [
  IqcStatus.NOT_INSPECTED,
  IqcStatus.PENDING,
  IqcStatus.WAITING_RETURN,
  IqcStatus.COMPLETED,
]);

/**
 * Kiểm tra chất lượng hàng nhập (IQC) — bảng phẳng, 1 dòng = 1 lần kiểm 1 vật tư. `itemId`/
 * `supplierId`/`quantity` tự giữ (denormalized), `inventoryReceiptId`/`outsourcingReceiptId`/
 * `purchaseOrderId` chỉ để trace ở mức chứng từ (tối đa một trong ba khác `null`) — không có FK
 * mức dòng vì `purchase_order_items` không có số thứ tự dòng. Xem `docs/domains/quality.md`.
 */
export const iqcInspections = pgTable(
  'iqc_inspections',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: varchar('code', { length: 50 }).notNull().unique(),
    inventoryReceiptId: uuid('inventory_receipt_id').references(
      () => inventoryReceipts.id,
      { onDelete: 'set null' },
    ),
    outsourcingReceiptId: uuid('outsourcing_receipt_id').references(
      () => outsourcingReceipts.id,
      { onDelete: 'set null' },
    ),
    purchaseOrderId: uuid('purchase_order_id').references(
      () => purchaseOrders.id,
      { onDelete: 'set null' },
    ),
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => suppliers.id, { onDelete: 'restrict' }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'restrict' }),
    quantity: numeric('quantity', {
      precision: 18,
      scale: 3,
      mode: 'number',
    }).notNull(),
    // Thời điểm kiểm thực tế — set lúc tạo, sửa lại được đúng một lần lúc
    // `POST /iqc/:iqcId/confirm` (xem ConfirmIqcReqDto.inspectionDate).
    inspectionDate: timestamp('inspection_date').notNull(),
    result: iqcResultEnum('result'),
    disposition: iqcDispositionEnum('disposition'),
    status: iqcStatusEnum('status').notNull().default(IqcStatus.PENDING),
    // Hiện chung ô "PO / Lý do" trên FE khi không có purchaseOrderId (hàng không qua PO).
    reason: varchar('reason', { length: 255 }),
    note: varchar('note', { length: 1000 }),
    // Cả 7 cột dưới và confirmedBy/confirmedAt đều nullable — chỉ có giá trị sau khi
    // `POST /iqc/:iqcId/confirm` lưu lần đầu, xem `docs/domains/quality.md`.
    inspectionLevel: iqcInspectionLevelEnum('inspection_level'),
    aqlLevel: numeric('aql_level', { precision: 4, scale: 2, mode: 'number' }),
    sampleSize: integer('sample_size'),
    defectQty: integer('defect_qty'),
    // Tiêu chuẩn kiểm (vd "VT-0152 Rev.02") — text tự do, không tra bảng danh mục.
    inspectionStandard: varchar('inspection_standard', { length: 100 }),
    // Tên người kiểm thực tế ngoài xưởng — text tự do, tách biệt với confirmedBy (tài khoản
    // bấm nút Xác nhận QC): người kiểm thật có thể không có tài khoản trong hệ thống.
    inspectorName: varchar('inspector_name', { length: 100 }),
    measuringTools: varchar('measuring_tools', { length: 255 }),
    confirmedBy: uuid('confirmed_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    confirmedAt: timestamp('confirmed_at'),
    // Nullable — chỉ có giá trị khi dòng FAIL đã được chọn phương án xử lý (`POST
    // /iqc/:iqcId/confirm` — route `resolve` cũ đã gộp vào confirm). Tách biệt với
    // confirmedBy/confirmedAt: 2 hành động khác nhau, có thể do người khác nhau, ở thời điểm khác
    // nhau. Xem `docs/domains/quality.md`.
    resolvedBy: uuid('resolved_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    resolvedAt: timestamp('resolved_at'),
    // Bộ phận QC đã kiểm — FK vào master data thật (không phải text tự do như `inspectorName`,
    // vì bộ phận luôn có sẵn còn người kiểm thật ngoài xưởng có thể không có tài khoản).
    qcDepartmentId: uuid('qc_department_id').references(() => departments.id, {
      onDelete: 'set null',
    }),
    // Ghi chú kèm theo `result` — tách biệt `dispositionNote` (ghi chú kèm quyết định xử lý), 2
    // hành động khác nhau, có thể ghi ở 2 lần lưu khác nhau.
    resultNote: varchar('result_note', { length: 500 }),
    dispositionNote: varchar('disposition_note', { length: 500 }),
    // Tách OK/NG khi `disposition = SORT` (kiểm tra 100% để phân loại) — `sortNgQty` là số lượng
    // đi vào phiếu trả NCC tự sinh; `sortOkQty` clear tồn bình thường. Luôn cùng NULL hay cùng có
    // giá trị (`chk_iqc_inspections_sort_qty_pair`), chỉ hợp lệ khi SORT
    // (`chk_iqc_inspections_sort_qty_requires_sort`), và cộng lại đúng `quantity`
    // (`chk_iqc_inspections_sort_qty_total`).
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
    index('idx_iqc_inspections_inventory_receipt_id').on(
      table.inventoryReceiptId,
    ),
    index('idx_iqc_inspections_outsourcing_receipt_id').on(
      table.outsourcingReceiptId,
    ),
    index('idx_iqc_inspections_purchase_order_id').on(table.purchaseOrderId),
    index('idx_iqc_inspections_supplier_id').on(table.supplierId),
    index('idx_iqc_inspections_item_id').on(table.itemId),
    index('idx_iqc_inspections_status').on(table.status),
    index('idx_iqc_inspections_result').on(table.result),
    index('idx_iqc_inspections_inspection_date').on(table.inspectionDate),
    index('idx_iqc_inspections_created_by').on(table.createdBy),
    index('idx_iqc_inspections_qc_department_id').on(table.qcDepartmentId),
    check('chk_iqc_inspections_quantity_positive', sql`quantity > 0`),
    // Bất biến nghiệp vụ: chỉ hàng FAIL mới có quyết định xử lý. Service còn kiểm lại bằng E139
    // trước khi insert để trả lỗi sạch — CHECK này là chốt chặn cuối, phòng ai ghi thẳng qua SQL.
    check(
      'chk_iqc_inspections_disposition_requires_fail',
      sql`disposition IS NULL OR result = 'FAIL'`,
    ),
    check(
      'chk_iqc_inspections_sample_size_positive',
      sql`sample_size IS NULL OR sample_size > 0`,
    ),
    check(
      'chk_iqc_inspections_defect_qty_non_negative',
      sql`defect_qty IS NULL OR defect_qty >= 0`,
    ),
    check(
      'chk_iqc_inspections_aql_level_valid',
      sql`aql_level IS NULL OR aql_level = ANY(ARRAY[0.65,1.0,1.5,2.5,4.0,6.5])`,
    ),
    check(
      'chk_iqc_inspections_sort_qty_pair',
      sql`(sort_ok_qty IS NULL AND sort_ng_qty IS NULL) OR (sort_ok_qty IS NOT NULL AND sort_ng_qty IS NOT NULL AND sort_ok_qty >= 0 AND sort_ng_qty >= 0)`,
    ),
    check(
      'chk_iqc_inspections_sort_qty_requires_sort',
      sql`(sort_ok_qty IS NULL AND sort_ng_qty IS NULL) OR disposition = 'SORT'`,
    ),
    // So bằng — cả 3 cột đều `numeric`, không phải float, nên phép cộng này chính xác tuyệt đối.
    check(
      'chk_iqc_inspections_sort_qty_total',
      sql`sort_ok_qty IS NULL OR sort_ok_qty + sort_ng_qty = quantity`,
    ),
  ],
);

export const iqcInspectionsRelations = relations(
  iqcInspections,
  ({ one, many }) => ({
    inventoryReceipt: one(inventoryReceipts, {
      fields: [iqcInspections.inventoryReceiptId],
      references: [inventoryReceipts.id],
    }),
    outsourcingReceipt: one(outsourcingReceipts, {
      fields: [iqcInspections.outsourcingReceiptId],
      references: [outsourcingReceipts.id],
    }),
    purchaseOrder: one(purchaseOrders, {
      fields: [iqcInspections.purchaseOrderId],
      references: [purchaseOrders.id],
    }),
    supplier: one(suppliers, {
      fields: [iqcInspections.supplierId],
      references: [suppliers.id],
    }),
    item: one(items, {
      fields: [iqcInspections.itemId],
      references: [items.id],
    }),
    qcDepartment: one(departments, {
      fields: [iqcInspections.qcDepartmentId],
      references: [departments.id],
    }),
    creatorBy: one(users, {
      fields: [iqcInspections.createdBy],
      references: [users.id],
    }),
    confirmerBy: one(users, {
      fields: [iqcInspections.confirmedBy],
      references: [users.id],
    }),
    resolverBy: one(users, {
      fields: [iqcInspections.resolvedBy],
      references: [users.id],
    }),
    attachments: many(iqcAttachments),
    // Thực tế tối đa 1 dòng (1 IQC chỉ tự sinh 1 phiếu trả NCC, đúng lúc `confirm` chuyển
    // `WAITING_RETURN`) nhưng khai `many` vì `supplier_returns.iqc_id` không có UNIQUE constraint
    // — xem `SupplierReturnsService.createFromIqcDisposition`.
    supplierReturns: many(supplierReturns),
  }),
);

export type IqcInspectionSelect = typeof iqcInspections.$inferSelect;
