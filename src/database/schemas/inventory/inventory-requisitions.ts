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
import { productionJobs } from '../production/production-jobs';
import { productionOrders } from '../production/production-orders';
import { users } from '../identity-access/users';
import { inventoryIssues } from './inventory-issues';
import { inventoryRequisitionItems } from './inventory-requisition-items';

export enum InventoryRequisitionType {
  PRODUCTION = 'PRODUCTION',
  OTHER = 'OTHER',
}

export const inventoryRequisitionTypeEnum = pgEnum(
  'inventory_requisition_type',
  [InventoryRequisitionType.PRODUCTION, InventoryRequisitionType.OTHER],
);

export enum InventoryRequisitionStatus {
  DRAFT = 'DRAFT',
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  APPROVED = 'APPROVED',
  ISSUED = 'ISSUED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
}

export const inventoryRequisitionStatusEnum = pgEnum(
  'inventory_requisition_status',
  [
    InventoryRequisitionStatus.DRAFT,
    InventoryRequisitionStatus.PENDING_APPROVAL,
    InventoryRequisitionStatus.APPROVED,
    InventoryRequisitionStatus.ISSUED,
    InventoryRequisitionStatus.REJECTED,
    InventoryRequisitionStatus.CANCELLED,
  ],
);

/**
 * Phiếu lãnh vật tư — chứng từ duy nhất đưa RM ra khỏi kho cho sản xuất
 * (`docs/domains/inventory.md`, mục "Phiếu lãnh vật tư"). `status` cố ý không dùng chung
 * `inventory_document_status` với `inventory_receipts`/`inventory_issues`/`supplier_returns` —
 * ba bảng đó sẽ nhận 3 giá trị duyệt chúng không bao giờ dùng.
 */
export const inventoryRequisitions = pgTable(
  'inventory_requisitions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: varchar('code', { length: 50 }).notNull().unique(),
    requisitionDate: date('requisition_date', { mode: 'date' }).notNull(),
    type: inventoryRequisitionTypeEnum('type').notNull(),
    departmentId: uuid('department_id').references(() => departments.id, {
      onDelete: 'set null',
    }),
    productionOrderId: uuid('production_order_id').references(
      () => productionOrders.id,
      { onDelete: 'set null' },
    ),
    // Job bị hard-delete khi LSX chứa nó được duyệt lại (`ProductionOrdersService.seedPlan`) —
    // `set null` để phiếu đã ISSUED sống sót qua việc đó. Bắt buộc-khi-type=PRODUCTION nằm ở
    // service (`E233`), không phải CHECK: CHECK cộng `set null` sẽ chặn luôn lệnh xoá Job.
    productionJobId: uuid('production_job_id').references(
      () => productionJobs.id,
      { onDelete: 'set null' },
    ),
    reason: varchar('reason', { length: 500 }),
    status: inventoryRequisitionStatusEnum('status')
      .notNull()
      .default(InventoryRequisitionStatus.DRAFT),
    note: varchar('note', { length: 1000 }),
    inventoryIssueId: uuid('inventory_issue_id').references(
      () => inventoryIssues.id,
      { onDelete: 'set null' },
    ),
    createdBy: uuid('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    sentBy: uuid('sent_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    sentAt: timestamp('sent_at'),
    approvedBy: uuid('approved_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    approvedAt: timestamp('approved_at'),
    rejectedBy: uuid('rejected_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    rejectedAt: timestamp('rejected_at'),
    rejectionReason: varchar('rejection_reason', { length: 1000 }),
    issuedBy: uuid('issued_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    issuedAt: timestamp('issued_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('idx_inventory_requisitions_department_id').on(table.departmentId),
    index('idx_inventory_requisitions_production_order_id').on(
      table.productionOrderId,
    ),
    index('idx_inventory_requisitions_production_job_id').on(
      table.productionJobId,
    ),
    index('idx_inventory_requisitions_status').on(table.status),
    index('idx_inventory_requisitions_type').on(table.type),
    index('idx_inventory_requisitions_requisition_date').on(
      table.requisitionDate,
    ),
    index('idx_inventory_requisitions_inventory_issue_id').on(
      table.inventoryIssueId,
    ),
    index('idx_inventory_requisitions_created_by').on(table.createdBy),
    index('idx_inventory_requisitions_sent_by').on(table.sentBy),
    index('idx_inventory_requisitions_approved_by').on(table.approvedBy),
    index('idx_inventory_requisitions_rejected_by').on(table.rejectedBy),
    index('idx_inventory_requisitions_issued_by').on(table.issuedBy),
  ],
);

export const inventoryRequisitionsRelations = relations(
  inventoryRequisitions,
  ({ one, many }) => ({
    department: one(departments, {
      fields: [inventoryRequisitions.departmentId],
      references: [departments.id],
    }),
    productionOrder: one(productionOrders, {
      fields: [inventoryRequisitions.productionOrderId],
      references: [productionOrders.id],
    }),
    productionJob: one(productionJobs, {
      fields: [inventoryRequisitions.productionJobId],
      references: [productionJobs.id],
    }),
    inventoryIssue: one(inventoryIssues, {
      fields: [inventoryRequisitions.inventoryIssueId],
      references: [inventoryIssues.id],
    }),
    creatorBy: one(users, {
      fields: [inventoryRequisitions.createdBy],
      references: [users.id],
    }),
    senderBy: one(users, {
      fields: [inventoryRequisitions.sentBy],
      references: [users.id],
    }),
    approverBy: one(users, {
      fields: [inventoryRequisitions.approvedBy],
      references: [users.id],
    }),
    rejecterBy: one(users, {
      fields: [inventoryRequisitions.rejectedBy],
      references: [users.id],
    }),
    issuerBy: one(users, {
      fields: [inventoryRequisitions.issuedBy],
      references: [users.id],
    }),
    items: many(inventoryRequisitionItems),
  }),
);

export type InventoryRequisitionSelect =
  typeof inventoryRequisitions.$inferSelect;
