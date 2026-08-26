import { relations, sql } from 'drizzle-orm';
import {
  check,
  date,
  foreignKey,
  index,
  numeric,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import {
  InventoryDocumentStatus,
  inventoryDocumentStatusEnum,
} from './inventory-documents';
import { inventoryReceipts } from './inventory-receipts';
import { outsourcingReceipts } from './outsourcing-receipts';
import { supplierReturnFiles } from './supplier-return-files';
import { warehouses } from './warehouses';
import { items } from '../items/items';
import { purchaseOrders } from '../purchasing/purchase-orders';
import { qcInspections } from '../quality/qc-inspections';
import { qcKindEnum, QcKind, qcRequests } from '../quality/qc-requests';
import { suppliers } from '../suppliers/suppliers';
import { users } from '../identity-access/users';

/**
 * Phiếu trả NCC — bảng phẳng, 1 phiếu = đúng 1 dòng vật tư (không có bảng con). `DRAFT → POSTED`
 * qua `SupplierReturnsService.postSupplierReturn` — tự sinh (DRAFT) từ `IqcService.confirmIqc`
 * khi QC chọn disposition SORT/RETURN, kho xác nhận xuất trả thì `post`. Chưa có `cancel` (huỷ một
 * phiếu đã `POSTED` cần đường "un-complete" IQC liên kết, để đợt sau — `docs/domains/inventory.md`).
 */
export const supplierReturns = pgTable(
  'supplier_returns',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: varchar('code', { length: 50 }).notNull().unique(),
    // Nullable — phiếu sinh từ IQC của OS-IN không có kho: hàng là WIP, chưa từng vào
    // `inventory_balances` (`docs/decisions/wip-not-stocked.md`), CHECK bên dưới bắt buộc có giá
    // trị cho mọi nguồn khác.
    warehouseId: uuid('warehouse_id').references(() => warehouses.id, {
      onDelete: 'restrict',
    }),
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
    purchaseOrderId: uuid('purchase_order_id').references(
      () => purchaseOrders.id,
      { onDelete: 'set null' },
    ),
    inventoryReceiptId: uuid('inventory_receipt_id').references(
      () => inventoryReceipts.id,
      { onDelete: 'set null' },
    ),
    outsourcingReceiptId: uuid('outsourcing_receipt_id').references(
      () => outsourcingReceipts.id,
      { onDelete: 'set null' },
    ),
    // Trỏ `qc_requests` (lô kiểm), không phải `qc_inspections` (lần kiểm) — dòng mà
    // `completeIqcAfterSupplierReturn` `UPDATE status = COMPLETED` là request, attempt append-only
    // không update được.
    iqcId: uuid('iqc_id'),
    // Luôn 'INCOMING' khi `iqcId` có giá trị — phiếu trả NCC chỉ sinh từ nhánh IQC
    // (`IqcService.confirmIqc` → `createFromIqcDisposition`), không bao giờ từ nhánh OUTGOING. Cột
    // + CHECK + composite FK bên dưới là cách duy nhất giữ lại ràng buộc "chỉ trỏ được vào phiếu
    // IQC" sau khi IQC/OQC gộp một bảng (`docs/decisions/qc-single-table.md`) — không có cột này,
    // `iqcId` trỏ được vào bất kỳ dòng `qc_requests` nào, kể cả OQC. Nullable (không `NOT NULL`) dù
    // luôn được set ở INSERT (default) — composite FK `ON DELETE SET NULL` set cả hai cột về NULL
    // cùng lúc khi dòng QC bị xoá, `NOT NULL` sẽ vi phạm ngay lúc đó.
    qcKind: qcKindEnum('qc_kind').default(QcKind.INCOMING),
    // Trỏ đúng lần kiểm (`qc_inspections`) đã ra quyết định SORT/RETURN sinh ra phiếu này — trả lời
    // được "phiếu trả NCC này sinh từ lần kiểm thứ mấy" khi 1 request có nhiều attempt. Nullable
    // cùng lý do `iqcId`; không có CHECK riêng vì composite FK bên dưới đã ràng buộc `kind` qua cột
    // `qcKind` dùng chung.
    qcInspectionId: uuid('qc_inspection_id'),
    returnDate: date('return_date', { mode: 'date' }).notNull(),
    status: inventoryDocumentStatusEnum('status')
      .notNull()
      .default(InventoryDocumentStatus.DRAFT),
    note: varchar('note', { length: 1000 }),
    postedBy: uuid('posted_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    postedAt: timestamp('posted_at'),
    // Ghi lúc `post` (kho xác nhận xuất trả) — khác `note` (ghi lúc tạo, hiện luôn rỗng vì chưa có
    // route tạo tay). Tách cột vì 2 mốc thời gian khác nhau, cùng lý do `qc_inspections
    // .dispositionNote` tách khỏi `resultNote`.
    postNote: varchar('post_note', { length: 500 }),
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
    index('idx_supplier_returns_warehouse_id').on(table.warehouseId),
    index('idx_supplier_returns_supplier_id').on(table.supplierId),
    index('idx_supplier_returns_item_id').on(table.itemId),
    index('idx_supplier_returns_purchase_order_id').on(table.purchaseOrderId),
    index('idx_supplier_returns_inventory_receipt_id').on(
      table.inventoryReceiptId,
    ),
    index('idx_supplier_returns_outsourcing_receipt_id').on(
      table.outsourcingReceiptId,
    ),
    index('idx_supplier_returns_iqc_id').on(table.iqcId),
    index('idx_supplier_returns_qc_inspection_id').on(table.qcInspectionId),
    index('idx_supplier_returns_status').on(table.status),
    index('idx_supplier_returns_return_date').on(table.returnDate),
    index('idx_supplier_returns_created_by').on(table.createdBy),
    check('chk_supplier_returns_quantity_positive', sql`quantity > 0`),
    check(
      'chk_supplier_returns_warehouse_required',
      sql`(warehouse_id IS NULL) = (outsourcing_receipt_id IS NOT NULL)`,
    ),
    check(
      'chk_supplier_returns_qc_kind',
      sql`qc_kind IS NULL OR qc_kind = 'INCOMING'`,
    ),
    foreignKey({
      columns: [table.iqcId, table.qcKind],
      foreignColumns: [qcRequests.id, qcRequests.kind],
      name: 'fk_supplier_returns_iqc_id_qc_kind',
    }).onDelete('set null'),
    foreignKey({
      columns: [table.qcInspectionId, table.qcKind],
      foreignColumns: [qcInspections.id, qcInspections.kind],
      name: 'fk_supplier_returns_qc_inspection_id_qc_kind',
    }).onDelete('set null'),
  ],
);

export const supplierReturnsRelations = relations(
  supplierReturns,
  ({ one, many }) => ({
    warehouse: one(warehouses, {
      fields: [supplierReturns.warehouseId],
      references: [warehouses.id],
    }),
    supplier: one(suppliers, {
      fields: [supplierReturns.supplierId],
      references: [suppliers.id],
    }),
    item: one(items, {
      fields: [supplierReturns.itemId],
      references: [items.id],
    }),
    purchaseOrder: one(purchaseOrders, {
      fields: [supplierReturns.purchaseOrderId],
      references: [purchaseOrders.id],
    }),
    inventoryReceipt: one(inventoryReceipts, {
      fields: [supplierReturns.inventoryReceiptId],
      references: [inventoryReceipts.id],
    }),
    outsourcingReceipt: one(outsourcingReceipts, {
      fields: [supplierReturns.outsourcingReceiptId],
      references: [outsourcingReceipts.id],
    }),
    iqc: one(qcRequests, {
      fields: [supplierReturns.iqcId],
      references: [qcRequests.id],
    }),
    qcInspection: one(qcInspections, {
      fields: [supplierReturns.qcInspectionId],
      references: [qcInspections.id],
    }),
    creatorBy: one(users, {
      fields: [supplierReturns.createdBy],
      references: [users.id],
    }),
    posterBy: one(users, {
      fields: [supplierReturns.postedBy],
      references: [users.id],
    }),
    files: many(supplierReturnFiles),
  }),
);

export type SupplierReturnSelect = typeof supplierReturns.$inferSelect;
