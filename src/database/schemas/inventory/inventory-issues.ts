import { relations } from 'drizzle-orm';
import {
  date,
  index,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { departments } from '../departments';
import {
  InventoryDocumentStatus,
  inventoryDocumentStatusEnum,
} from './inventory-documents';
import { inventoryIssueItems } from './inventory-issue-items';
import { outboundOrders } from './outbound-orders';
import { productionJobs } from '../production/production-jobs';
import { productionOrders } from '../production/production-orders';
import { users } from '../identity-access/users';

export enum InventoryIssueType {
  PRODUCTION = 'PRODUCTION',
  SALES = 'SALES',
  RETURN = 'RETURN',
}

export const inventoryIssueTypeEnum = pgEnum('inventory_issue_type', [
  InventoryIssueType.PRODUCTION,
  InventoryIssueType.SALES,
  InventoryIssueType.RETURN,
]);

/**
 * Phiếu xuất kho — header, cùng khuôn `inventory_receipts` (status/postedBy/postedAt/createdBy)
 * nhưng vòng đời ngắn hơn — chỉ 3 trạng thái, không có nhánh IQC (`docs/domains/inventory.md`).
 */
export const inventoryIssues = pgTable(
  'inventory_issues',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: varchar('code', { length: 50 }).notNull().unique(),
    issueType: inventoryIssueTypeEnum('issue_type').notNull(),
    status: inventoryDocumentStatusEnum('status')
      .notNull()
      .default(InventoryDocumentStatus.DRAFT),
    issueDate: date('issue_date', { mode: 'date' }).notNull(),
    // `set null` cho cả hai — LSX/Job có thể bị hard-delete khi LSX chứa nó được duyệt lại
    // (`ProductionOrdersService.seedPlan`); phiếu đã post phải sống sót qua việc đó.
    productionOrderId: uuid('production_order_id').references(
      () => productionOrders.id,
      { onDelete: 'set null' },
    ),
    productionJobId: uuid('production_job_id').references(
      () => productionJobs.id,
      { onDelete: 'set null' },
    ),
    // Chỉ `OutboundOrdersService.deliver` (issueType = SALES) ghi cột này — phiếu xuất tự sinh lúc
    // giao hàng, dùng để thẻ kho trace ngược về DO. `set null`, không backfill phiếu cũ trước
    // migration này (`docs/domains/inventory.md`).
    outboundOrderId: uuid('outbound_order_id').references(
      () => outboundOrders.id,
      { onDelete: 'set null' },
    ),
    departmentId: uuid('department_id').references(() => departments.id, {
      onDelete: 'set null',
    }),
    requestedBy: uuid('requested_by').references(() => users.id, {
      onDelete: 'set null',
    }),
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
    index('idx_inventory_issues_status').on(table.status),
    index('idx_inventory_issues_issue_type').on(table.issueType),
    index('idx_inventory_issues_issue_date').on(table.issueDate),
    index('idx_inventory_issues_production_order_id').on(
      table.productionOrderId,
    ),
    index('idx_inventory_issues_production_job_id').on(table.productionJobId),
    index('idx_inventory_issues_outbound_order_id').on(table.outboundOrderId),
    index('idx_inventory_issues_department_id').on(table.departmentId),
    index('idx_inventory_issues_created_by').on(table.createdBy),
    index('idx_inventory_issues_requested_by').on(table.requestedBy),
    index('idx_inventory_issues_posted_by').on(table.postedBy),
  ],
);

export const inventoryIssuesRelations = relations(
  inventoryIssues,
  ({ one, many }) => ({
    productionOrder: one(productionOrders, {
      fields: [inventoryIssues.productionOrderId],
      references: [productionOrders.id],
    }),
    productionJob: one(productionJobs, {
      fields: [inventoryIssues.productionJobId],
      references: [productionJobs.id],
    }),
    outboundOrder: one(outboundOrders, {
      fields: [inventoryIssues.outboundOrderId],
      references: [outboundOrders.id],
    }),
    department: one(departments, {
      fields: [inventoryIssues.departmentId],
      references: [departments.id],
    }),
    requesterBy: one(users, {
      fields: [inventoryIssues.requestedBy],
      references: [users.id],
    }),
    posterBy: one(users, {
      fields: [inventoryIssues.postedBy],
      references: [users.id],
    }),
    creatorBy: one(users, {
      fields: [inventoryIssues.createdBy],
      references: [users.id],
    }),
    items: many(inventoryIssueItems),
  }),
);

export type InventoryIssueSelect = typeof inventoryIssues.$inferSelect;
