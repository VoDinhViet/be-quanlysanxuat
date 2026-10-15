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
import { productionJobBomItems } from '../production/production-job-bom-items';
import { productionJobOperations } from '../production/production-job-operations';
import { productionJobs } from '../production/production-jobs';

/**
 * Dòng phiếu gửi gia công ngoài (OS-OUT) — client gửi đủ cột snapshot (`productionJobBomItemId`,
 * `itemCode`/`itemName`, `productionJobId`, `operationCode`...) lấy từ popup
 * `GET .../outsourceable-operations`, server không resolve lại. Xem `docs/CODEMAPS/production.md`.
 *
 * Không unique DB trên `(outsourcingOrderId, productionJobOperationId)`: gửi cùng một công đoạn ở
 * nhiều phiếu qua nhiều đợt là luồng thật (`sentQuantity` cộng dồn qua mọi phiếu, so với
 * `plannedQuantity`). Trùng công đoạn trong cùng một phiếu bị chặn ở service (`E183`); unique DB
 * cũng mất hiệu lực khi `productionJobOperationId` về NULL (Postgres coi NULL là distinct).
 */
export const outsourcingOrderItems = pgTable(
  'outsourcing_order_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    outsourcingOrderId: uuid('outsourcing_order_id')
      .notNull()
      .references(() => outsourcingOrders.id, { onDelete: 'cascade' }),
    // `set null` cho cả ba: Job có thể bị hard-delete (huỷ SO, `ProductionOrdersService.seedPlan`);
    // phiếu phải sống sót, xem `inventory_issues.productionJobId`.
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
    // Snapshot bắt buộc: `productionJobOperationId` có thể về null (Job bị hard-delete), khi đó
    // `operationCode`/`operationName` là nguồn hiển thị chính.
    operationCode: varchar('operation_code', { length: 50 }).notNull(),
    operationName: varchar('operation_name', { length: 255 }).notNull(),
    // Node Job cụ thể được gửi đi; `set null` cùng lý do `productionJobId`, `itemCode`/`itemName` là
    // snapshot bắt buộc thay thế.
    productionJobBomItemId: uuid('production_job_bom_item_id').references(
      () => productionJobBomItems.id,
      { onDelete: 'set null' },
    ),
    itemCode: varchar('item_code', { length: 50 }).notNull(),
    itemName: varchar('item_name', { length: 255 }).notNull(),
    // Chỉ có khi node là DIRECT (tham khảo) — node COMPONENT không phải một item, NULL.
    itemId: uuid('item_id').references(() => items.id, {
      onDelete: 'set null',
    }),
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
    index('idx_outsourcing_order_items_production_job_bom_item_id').on(
      table.productionJobBomItemId,
    ),
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
    productionJobBomItem: one(productionJobBomItems, {
      fields: [outsourcingOrderItems.productionJobBomItemId],
      references: [productionJobBomItems.id],
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
