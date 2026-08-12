import { relations, sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  numeric,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { inventoryReceipts } from '../inventory/inventory-receipts';
import { items } from '../items/items';
import { purchaseOrders } from '../purchasing/purchase-orders';
import { suppliers } from '../suppliers/suppliers';
import { users } from '../identity-access/users';

export enum IqcResult {
  PASS = 'PASS',
  FAIL = 'FAIL',
}

export const iqcResultEnum = pgEnum('iqc_result', [
  IqcResult.PASS,
  IqcResult.FAIL,
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
 * `PENDING` → FAIL chưa có quyết định xử lý. `WAITING_RETURN` → FAIL, `disposition` là SORT/RETURN,
 * chờ xuất trả NCC (`supplier_returns`, chưa nối route). `COMPLETED` → PASS, hoặc FAIL với
 * `disposition = CONCESSION`. Set một lần lúc tạo (`IqcService.resolveIqcStatus`) — chưa có route
 * nào chuyển `WAITING_RETURN` → `COMPLETED`, xem `docs/domains/quality.md`.
 */
export enum IqcStatus {
  PENDING = 'PENDING',
  WAITING_RETURN = 'WAITING_RETURN',
  COMPLETED = 'COMPLETED',
}

export const iqcStatusEnum = pgEnum('iqc_status', [
  IqcStatus.PENDING,
  IqcStatus.WAITING_RETURN,
  IqcStatus.COMPLETED,
]);

/**
 * Kiểm tra chất lượng hàng nhập (IQC) — bảng phẳng, 1 dòng = 1 lần kiểm 1 vật tư. `itemId`/
 * `supplierId`/`quantity` tự giữ (denormalized), `inventoryReceiptId`/`purchaseOrderId` chỉ để
 * trace ở mức chứng từ — không có FK mức dòng vì `purchase_order_items` không có số thứ tự dòng.
 * Xem `docs/domains/quality.md`.
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
    inspectionDate: date('inspection_date', { mode: 'date' }).notNull(),
    result: iqcResultEnum('result').notNull(),
    disposition: iqcDispositionEnum('disposition'),
    status: iqcStatusEnum('status').notNull().default(IqcStatus.PENDING),
    // Hiện chung ô "PO / Lý do" trên FE khi không có purchaseOrderId (hàng không qua PO).
    reason: varchar('reason', { length: 255 }),
    note: varchar('note', { length: 1000 }),
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
    index('idx_iqc_inspections_purchase_order_id').on(table.purchaseOrderId),
    index('idx_iqc_inspections_supplier_id').on(table.supplierId),
    index('idx_iqc_inspections_item_id').on(table.itemId),
    index('idx_iqc_inspections_status').on(table.status),
    index('idx_iqc_inspections_result').on(table.result),
    index('idx_iqc_inspections_inspection_date').on(table.inspectionDate),
    index('idx_iqc_inspections_created_by').on(table.createdBy),
    check('chk_iqc_inspections_quantity_positive', sql`quantity > 0`),
    // Bất biến nghiệp vụ: chỉ hàng FAIL mới có quyết định xử lý. Service còn kiểm lại bằng E139
    // trước khi insert để trả lỗi sạch — CHECK này là chốt chặn cuối, phòng ai ghi thẳng qua SQL.
    check(
      'chk_iqc_inspections_disposition_requires_fail',
      sql`disposition IS NULL OR result = 'FAIL'`,
    ),
  ],
);

export const iqcInspectionsRelations = relations(iqcInspections, ({ one }) => ({
  inventoryReceipt: one(inventoryReceipts, {
    fields: [iqcInspections.inventoryReceiptId],
    references: [inventoryReceipts.id],
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
  creatorBy: one(users, {
    fields: [iqcInspections.createdBy],
    references: [users.id],
  }),
}));

export type IqcInspectionSelect = typeof iqcInspections.$inferSelect;
