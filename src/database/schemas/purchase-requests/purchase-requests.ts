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
import { purchaseRequestItems } from './purchase-request-items';
import { users } from '../identity-access/users';

export enum PurchaseRequestStatus {
  DRAFT = 'DRAFT',
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export const purchaseRequestStatusEnum = pgEnum('purchase_request_status', [
  PurchaseRequestStatus.DRAFT,
  PurchaseRequestStatus.PENDING_APPROVAL,
  PurchaseRequestStatus.APPROVED,
  PurchaseRequestStatus.REJECTED,
]);

/**
 * Đề xuất mua hàng — phiếu xin duyệt nội bộ, không phải procurement. Hai đường sinh (lập tay
 * `POST /purchase-requests`, tự động từ `startJob`), vòng đời và quyền: xem
 * `docs/domains/purchase-requests.md` + `docs/decisions/no-procurement.md`.
 */
export const purchaseRequests = pgTable(
  'purchase_requests',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: varchar('code', { length: 50 }).notNull().unique(),
    neededDate: date('needed_date', { mode: 'date' }).notNull(),
    departmentId: uuid('department_id')
      .notNull()
      .references(() => departments.id, { onDelete: 'restrict' }),
    productionOrderId: uuid('production_order_id').references(
      () => productionOrders.id,
      { onDelete: 'set null' },
    ),
    // Job bị hard-delete khi LSX được duyệt lại (`ProductionOrdersService.seedPlan`) — `restrict`
    // sẽ chặn luồng đó, `cascade` sẽ xoá mất chứng từ đề xuất đã sinh.
    productionJobId: uuid('production_job_id').references(
      () => productionJobs.id,
      { onDelete: 'set null' },
    ),
    status: purchaseRequestStatusEnum('status')
      .notNull()
      .default(PurchaseRequestStatus.DRAFT),
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
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('idx_purchase_requests_department_id').on(table.departmentId),
    index('idx_purchase_requests_production_order_id').on(
      table.productionOrderId,
    ),
    index('idx_purchase_requests_production_job_id').on(table.productionJobId),
    index('idx_purchase_requests_created_by').on(table.createdBy),
    index('idx_purchase_requests_status').on(table.status),
    index('idx_purchase_requests_needed_date').on(table.neededDate),
  ],
);

export const purchaseRequestsRelations = relations(
  purchaseRequests,
  ({ one, many }) => ({
    department: one(departments, {
      fields: [purchaseRequests.departmentId],
      references: [departments.id],
    }),
    productionOrder: one(productionOrders, {
      fields: [purchaseRequests.productionOrderId],
      references: [productionOrders.id],
    }),
    productionJob: one(productionJobs, {
      fields: [purchaseRequests.productionJobId],
      references: [productionJobs.id],
    }),
    requesterBy: one(users, {
      fields: [purchaseRequests.createdBy],
      references: [users.id],
    }),
    senderBy: one(users, {
      fields: [purchaseRequests.sentBy],
      references: [users.id],
    }),
    approverBy: one(users, {
      fields: [purchaseRequests.approvedBy],
      references: [users.id],
    }),
    rejecterBy: one(users, {
      fields: [purchaseRequests.rejectedBy],
      references: [users.id],
    }),
    items: many(purchaseRequestItems),
  }),
);
