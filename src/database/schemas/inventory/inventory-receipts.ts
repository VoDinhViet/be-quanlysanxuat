import { relations } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import {
  InventoryDocumentStatus,
  inventoryDocumentStatusEnum,
} from './inventory-documents';
import { inventoryReceiptItems } from './inventory-receipt-items';
import { warehouses } from './warehouses';
import { clients } from '../clients/clients';
import { productionJobs } from '../production/production-jobs';
import { productionOrders } from '../production/production-orders';
import { purchaseOrders } from '../purchasing/purchase-orders';
import { purchaseRequests } from '../purchase-requests/purchase-requests';
import { suppliers } from '../suppliers/suppliers';
import { users } from '../identity-access/users';

export enum InventoryReceiptType {
  PURCHASE = 'PURCHASE',
  PRODUCTION = 'PRODUCTION',
  RETURN = 'RETURN',
  ADJUSTMENT = 'ADJUSTMENT',
}

export const inventoryReceiptTypeEnum = pgEnum('inventory_receipt_type', [
  InventoryReceiptType.PURCHASE,
  InventoryReceiptType.PRODUCTION,
  InventoryReceiptType.RETURN,
  InventoryReceiptType.ADJUSTMENT,
]);

export enum InventoryReceiptAssetType {
  COMPANY = 'COMPANY',
  CLIENT = 'CLIENT',
}

export const inventoryReceiptAssetTypeEnum = pgEnum(
  'inventory_receipt_asset_type',
  [InventoryReceiptAssetType.COMPANY, InventoryReceiptAssetType.CLIENT],
);

/**
 * Phiếu nhập kho — header. `DRAFT` sửa/xoá tự do, không đụng tồn; `post` (`DRAFT → POSTED`) mới
 * sinh `inventory_transactions`/cập nhật `inventory_balances`, sau đó phiếu bất biến
 * (`docs/domains/inventory.md`). `supplierId`/`clientId` loại trừ lẫn nhau — nhập từ khách hàng
 * (`receiptType = RETURN`) dùng `clientId`, còn lại dùng `supplierId`.
 */
export const inventoryReceipts = pgTable(
  'inventory_receipts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: varchar('code', { length: 50 }).notNull().unique(),
    warehouseId: uuid('warehouse_id')
      .notNull()
      .references(() => warehouses.id, { onDelete: 'restrict' }),
    receiptType: inventoryReceiptTypeEnum('receipt_type').notNull(),
    status: inventoryDocumentStatusEnum('status')
      .notNull()
      .default(InventoryDocumentStatus.DRAFT),
    requiresIqc: boolean('requires_iqc').notNull().default(false),
    receiptDate: date('receipt_date', { mode: 'date' }).notNull(),
    supplierId: uuid('supplier_id').references(() => suppliers.id, {
      onDelete: 'set null',
    }),
    // Khách hàng gửi trả (receiptType = RETURN) — loại trừ lẫn nhau với supplierId
    // (chk_inventory_receipts_supplier_client_exclusive), xem docs/domains/inventory.md.
    clientId: uuid('client_id').references(() => clients.id, {
      onDelete: 'set null',
    }),
    // Nhãn phân loại tài sản, chọn tay độc lập với clientId — không tách tồn kho theo chủ sở
    // hữu, xem docs/domains/inventory.md mục "Nhập từ khách hàng".
    assetType: inventoryReceiptAssetTypeEnum('asset_type')
      .notNull()
      .default(InventoryReceiptAssetType.COMPANY),
    purchaseRequestId: uuid('purchase_request_id').references(
      () => purchaseRequests.id,
      { onDelete: 'set null' },
    ),
    // `set null`, không `restrict`/`cascade` — một LSX bị hard-delete khi đơn gốc được duyệt lại
    // (`ProductionOrdersService.seedPlan`); phiếu đã post phải sống sót qua việc đó.
    productionOrderId: uuid('production_order_id').references(
      () => productionOrders.id,
      { onDelete: 'set null' },
    ),
    // `set null`, cùng lý do `productionOrderId` — bắt buộc khi `receiptType = PRODUCTION`
    // (service-enforced, `E179`), dùng làm neo cho gate QC (`getJobQcCoverage`,
    // `docs/domains/inventory.md`).
    productionJobId: uuid('production_job_id').references(
      () => productionJobs.id,
      { onDelete: 'set null' },
    ),
    // Trace mức phiếu về đơn mua sinh ra nó (`docs/domains/purchasing.md`) — thuần để trace, không
    // đọc để tính tồn/bút toán.
    purchaseOrderId: uuid('purchase_order_id').references(
      () => purchaseOrders.id,
      { onDelete: 'set null' },
    ),
    note: varchar('note', { length: 1000 }),
    postedBy: uuid('posted_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    postedAt: timestamp('posted_at'),
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
    index('idx_inventory_receipts_warehouse_id').on(table.warehouseId),
    index('idx_inventory_receipts_status').on(table.status),
    index('idx_inventory_receipts_receipt_type').on(table.receiptType),
    index('idx_inventory_receipts_receipt_date').on(table.receiptDate),
    index('idx_inventory_receipts_supplier_id').on(table.supplierId),
    index('idx_inventory_receipts_client_id').on(table.clientId),
    index('idx_inventory_receipts_production_order_id').on(
      table.productionOrderId,
    ),
    index('idx_inventory_receipts_production_job_id').on(table.productionJobId),
    index('idx_inventory_receipts_purchase_order_id').on(table.purchaseOrderId),
    index('idx_inventory_receipts_created_by').on(table.createdBy),
    index('idx_inventory_receipts_purchase_request_id').on(
      table.purchaseRequestId,
    ),
    index('idx_inventory_receipts_posted_by').on(table.postedBy),
    check(
      'chk_inventory_receipts_supplier_client_exclusive',
      sql`NOT (supplier_id IS NOT NULL AND client_id IS NOT NULL)`,
    ),
  ],
);

export const inventoryReceiptsRelations = relations(
  inventoryReceipts,
  ({ one, many }) => ({
    warehouse: one(warehouses, {
      fields: [inventoryReceipts.warehouseId],
      references: [warehouses.id],
    }),
    supplier: one(suppliers, {
      fields: [inventoryReceipts.supplierId],
      references: [suppliers.id],
    }),
    client: one(clients, {
      fields: [inventoryReceipts.clientId],
      references: [clients.id],
    }),
    purchaseRequest: one(purchaseRequests, {
      fields: [inventoryReceipts.purchaseRequestId],
      references: [purchaseRequests.id],
    }),
    productionOrder: one(productionOrders, {
      fields: [inventoryReceipts.productionOrderId],
      references: [productionOrders.id],
    }),
    productionJob: one(productionJobs, {
      fields: [inventoryReceipts.productionJobId],
      references: [productionJobs.id],
    }),
    purchaseOrder: one(purchaseOrders, {
      fields: [inventoryReceipts.purchaseOrderId],
      references: [purchaseOrders.id],
    }),
    posterBy: one(users, {
      fields: [inventoryReceipts.postedBy],
      references: [users.id],
    }),
    creatorBy: one(users, {
      fields: [inventoryReceipts.createdBy],
      references: [users.id],
    }),
    items: many(inventoryReceiptItems),
  }),
);

export type InventoryReceiptSelect = typeof inventoryReceipts.$inferSelect;
