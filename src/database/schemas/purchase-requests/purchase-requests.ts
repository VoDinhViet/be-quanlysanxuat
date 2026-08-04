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
 * Đề xuất mua hàng — phiếu xin duyệt nội bộ, không phải procurement
 * (`docs/domains/purchase-requests.md`, `docs/decisions/no-procurement.md`). Giai đoạn 1: chỉ
 * `GET /purchase-requests`; `status` đủ 4 giá trị cho vòng đời sau nhưng chưa route nào ghi nó.
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
    status: purchaseRequestStatusEnum('status')
      .notNull()
      .default(PurchaseRequestStatus.DRAFT),
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
    index('idx_purchase_requests_department_id').on(table.departmentId),
    index('idx_purchase_requests_production_order_id').on(
      table.productionOrderId,
    ),
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
    requester: one(users, {
      fields: [purchaseRequests.createdBy],
      references: [users.id],
    }),
    items: many(purchaseRequestItems),
  }),
);
