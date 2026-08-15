import { relations, sql } from 'drizzle-orm';
import {
  check,
  date,
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
import { outsourcingReceipts } from './outsourcing-receipts';
import { warehouses } from './warehouses';
import { items } from '../items/items';
import { operations } from '../operations';
import { productionJobOperations } from '../production/production-job-operations';
import { productionJobs } from '../production/production-jobs';
import { suppliers } from '../suppliers/suppliers';
import { users } from '../identity-access/users';

/**
 * Phiếu gửi gia công ngoài (OS-OUT) — bảng phẳng, 1 phiếu = 1 dòng vật tư (cùng khuôn
 * `supplier_returns`). Bắt buộc gắn `productionJobOperationId` của một Job đang `IN_PROGRESS`,
 * công đoạn snapshot `type = OUTSOURCE` — validate ở service (`OutsourcingOrdersService.
 * createOutsourcingOrder`), không phải DB CHECK. `DRAFT → POSTED → CANCELLED`, tái dùng
 * `InventoryDocumentStatus` (chỉ dùng 3 giá trị này). Xem `docs/domains/inventory.md`,
 * `docs/workflows/outsourcing-round-trip.md`.
 */
export const outsourcingOrders = pgTable(
  'outsourcing_orders',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: varchar('code', { length: 50 }).notNull().unique(),
    warehouseId: uuid('warehouse_id')
      .notNull()
      .references(() => warehouses.id, { onDelete: 'restrict' }),
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
    // `set null` cho cả ba — Job có thể bị hard-delete khi LSX chứa nó được duyệt lại
    // (`ProductionOrdersService.seedPlan`); phiếu đã post phải sống sót qua việc đó, xem
    // `inventory_issues.productionJobId`.
    productionJobId: uuid('production_job_id').references(
      () => productionJobs.id,
      { onDelete: 'set null' },
    ),
    productionJobOperationId: uuid('production_job_operation_id').references(
      () => productionJobOperations.id,
      { onDelete: 'set null' },
    ),
    operationId: uuid('operation_id').references(() => operations.id, {
      onDelete: 'set null',
    }),
    // Snapshot bắt buộc (không nullable) — `productionJobOperationId` có thể về null (Job bị
    // hard-delete), operationCode/Name là nguồn hiển thị chính lúc đó, cùng lý do snapshot trên
    // `production_job_operations`.
    operationCode: varchar('operation_code', { length: 50 }).notNull(),
    operationName: varchar('operation_name', { length: 255 }).notNull(),
    sendDate: date('send_date', { mode: 'date' }).notNull(),
    expectedReturnDate: date('expected_return_date', { mode: 'date' }),
    status: inventoryDocumentStatusEnum('status')
      .notNull()
      .default(InventoryDocumentStatus.DRAFT),
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
    index('idx_outsourcing_orders_warehouse_id').on(table.warehouseId),
    index('idx_outsourcing_orders_supplier_id').on(table.supplierId),
    index('idx_outsourcing_orders_item_id').on(table.itemId),
    index('idx_outsourcing_orders_production_job_id').on(table.productionJobId),
    index('idx_outsourcing_orders_production_job_operation_id').on(
      table.productionJobOperationId,
    ),
    index('idx_outsourcing_orders_operation_id').on(table.operationId),
    index('idx_outsourcing_orders_status').on(table.status),
    index('idx_outsourcing_orders_send_date').on(table.sendDate),
    index('idx_outsourcing_orders_created_by').on(table.createdBy),
    check('chk_outsourcing_orders_quantity_positive', sql`quantity > 0`),
    check(
      'chk_outsourcing_orders_expected_return_date',
      sql`expected_return_date IS NULL OR expected_return_date >= send_date`,
    ),
  ],
);

export const outsourcingOrdersRelations = relations(
  outsourcingOrders,
  ({ one, many }) => ({
    warehouse: one(warehouses, {
      fields: [outsourcingOrders.warehouseId],
      references: [warehouses.id],
    }),
    supplier: one(suppliers, {
      fields: [outsourcingOrders.supplierId],
      references: [suppliers.id],
    }),
    item: one(items, {
      fields: [outsourcingOrders.itemId],
      references: [items.id],
    }),
    productionJob: one(productionJobs, {
      fields: [outsourcingOrders.productionJobId],
      references: [productionJobs.id],
    }),
    productionJobOperation: one(productionJobOperations, {
      fields: [outsourcingOrders.productionJobOperationId],
      references: [productionJobOperations.id],
    }),
    operation: one(operations, {
      fields: [outsourcingOrders.operationId],
      references: [operations.id],
    }),
    creatorBy: one(users, {
      fields: [outsourcingOrders.createdBy],
      references: [users.id],
    }),
    posterBy: one(users, {
      fields: [outsourcingOrders.postedBy],
      references: [users.id],
    }),
    receipts: many(outsourcingReceipts),
  }),
);

export type OutsourcingOrderSelect = typeof outsourcingOrders.$inferSelect;
