import { relations, sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  numeric,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { outsourcingOrders } from './outsourcing-orders';
import { outsourcingReceiptItems } from './outsourcing-receipt-items';
import { items } from '../items/items';
import { operations } from '../operations';
import { productionJobOperations } from '../production/production-job-operations';
import { productionJobs } from '../production/production-jobs';

/**
 * Dòng phiếu gửi gia công ngoài (OS-OUT) — client gửi đủ cột (`itemId`/`productionJobId`/
 * `operationCode`/`operationName`/...) lấy từ popup `GET .../outsourceable-operations`, server
 * không resolve/validate lại — chỉ FK + `.notNull()` ràng buộc
 * (`docs/decisions/outsourcing-no-draft.md`). Xem `docs/workflows/outsourcing-round-trip.md`.
 *
 * Không unique trên `(outsourcingOrderId, productionJobOperationId)` (từng có, đã bỏ) — gửi cùng
 * một công đoạn ở nhiều phiếu OS-OUT khác nhau qua nhiều đợt là luồng thật (`sentQuantity` cộng
 * dồn qua mọi phiếu, so với `plannedQuantity`, xem popup `outsourceable-operations`); ép unique
 * trong cùng một phiếu không có ErrorCode/doc nào đòi hỏi, và tự mất hiệu lực khi `production_job_operations`
 * bị hard-delete (`productionJobOperationId` về NULL, Postgres coi NULL là distinct).
 */
export const outsourcingOrderItems = pgTable(
  'outsourcing_order_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    outsourcingOrderId: uuid('outsourcing_order_id')
      .notNull()
      .references(() => outsourcingOrders.id, { onDelete: 'cascade' }),
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
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'restrict' }),
    quantity: numeric('quantity', {
      precision: 18,
      scale: 3,
      mode: 'number',
    }).notNull(),
    weight: numeric('weight', { precision: 12, scale: 3, mode: 'number' }),
    area: numeric('area', { precision: 12, scale: 3, mode: 'number' }),
    note: varchar('note', { length: 500 }),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('idx_outsourcing_order_items_outsourcing_order_id').on(
      table.outsourcingOrderId,
    ),
    index('idx_outsourcing_order_items_item_id').on(table.itemId),
    index('idx_outsourcing_order_items_production_job_id').on(
      table.productionJobId,
    ),
    index('idx_outsourcing_order_items_production_job_operation_id').on(
      table.productionJobOperationId,
    ),
    index('idx_outsourcing_order_items_operation_id').on(table.operationId),
    check('chk_outsourcing_order_items_quantity_positive', sql`quantity > 0`),
    check(
      'chk_outsourcing_order_items_weight',
      sql`weight IS NULL OR weight >= 0`,
    ),
    check('chk_outsourcing_order_items_area', sql`area IS NULL OR area >= 0`),
  ],
);

export const outsourcingOrderItemsRelations = relations(
  outsourcingOrderItems,
  ({ one, many }) => ({
    outsourcingOrder: one(outsourcingOrders, {
      fields: [outsourcingOrderItems.outsourcingOrderId],
      references: [outsourcingOrders.id],
    }),
    productionJob: one(productionJobs, {
      fields: [outsourcingOrderItems.productionJobId],
      references: [productionJobs.id],
    }),
    productionJobOperation: one(productionJobOperations, {
      fields: [outsourcingOrderItems.productionJobOperationId],
      references: [productionJobOperations.id],
    }),
    operation: one(operations, {
      fields: [outsourcingOrderItems.operationId],
      references: [operations.id],
    }),
    item: one(items, {
      fields: [outsourcingOrderItems.itemId],
      references: [items.id],
    }),
    receiptItems: many(outsourcingReceiptItems),
  }),
);

export type OutsourcingOrderItemSelect =
  typeof outsourcingOrderItems.$inferSelect;
