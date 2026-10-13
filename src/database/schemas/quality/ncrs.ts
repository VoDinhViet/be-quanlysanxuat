import { relations, sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  check,
  index,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { clients } from '../clients/clients';
import { departments } from '../departments';
import { users } from '../identity-access/users';
import { items } from '../items/items';
import { orders } from '../orders/orders';
import { productionJobs } from '../production/production-jobs';
import { productionOrders } from '../production/production-orders';
import { ncrCostLines } from './ncr-cost-lines';
import { ncrLogs } from './ncr-logs';
import { qualityInspections } from './quality-inspections';

/** `INTERNAL` = NCR-NB (lỗi nội bộ, sinh từ OQC sàng lọc hoặc tạo tay); `CUSTOMER` = NCR-KH
 * (khách hàng phản hồi, chỉ tạo tay). */
export enum NcrType {
  INTERNAL = 'INTERNAL',
  CUSTOMER = 'CUSTOMER',
}

export const ncrTypeEnum = pgEnum('ncr_type', [
  NcrType.INTERNAL,
  NcrType.CUSTOMER,
]);

export enum NcrOriginType {
  OQC = 'OQC',
  MANUAL = 'MANUAL',
}

export const ncrOriginTypeEnum = pgEnum('ncr_origin_type', [
  NcrOriginType.OQC,
  NcrOriginType.MANUAL,
]);

/**
 * `OPEN` (chờ phân tích) → `PENDING_APPROVAL` → `APPROVED` → `IN_PROGRESS` (đã tạo LSX phụ) hoặc
 * `PENDING_QC` (không tạo LSX, chờ OQC lại) → `CLOSED`. `REJECTED` = Giám đốc không duyệt, NCR quay
 * lại sửa phương án rồi gửi duyệt lại.
 */
export enum NcrStatus {
  OPEN = 'OPEN',
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  APPROVED = 'APPROVED',
  IN_PROGRESS = 'IN_PROGRESS',
  PENDING_QC = 'PENDING_QC',
  CLOSED = 'CLOSED',
  REJECTED = 'REJECTED',
}

export const ncrStatusEnum = pgEnum('ncr_status', [
  NcrStatus.OPEN,
  NcrStatus.PENDING_APPROVAL,
  NcrStatus.APPROVED,
  NcrStatus.IN_PROGRESS,
  NcrStatus.PENDING_QC,
  NcrStatus.CLOSED,
  NcrStatus.REJECTED,
]);

/**
 * NCR (phiếu không phù hợp) — 1 NCR = 1 sản phẩm. `ngQty` là SL hàng lỗi; `reworkQty`/`remakeQty`
 * là phần được sửa chữa / làm mới, phần còn lại (`ngQty − reworkQty − remakeQty`) chỉ ghi nhận.
 * `orderId` chỉ có khi cần tạo LSX phụ (NCR-NB lấy từ LSX gốc, NCR-KH do user chọn SO).
 */
export const ncrs = pgTable(
  'ncrs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: varchar('code', { length: 50 }).notNull().unique(),
    type: ncrTypeEnum('type').notNull(),
    originType: ncrOriginTypeEnum('origin_type').notNull(),
    status: ncrStatusEnum('status').notNull().default(NcrStatus.OPEN),
    qualityInspectionId: uuid('quality_inspection_id').references(
      (): AnyPgColumn => qualityInspections.id,
      { onDelete: 'restrict' },
    ),
    productionJobId: uuid('production_job_id').references(
      () => productionJobs.id,
      { onDelete: 'restrict' },
    ),
    parentNcrId: uuid('parent_ncr_id').references((): AnyPgColumn => ncrs.id, {
      onDelete: 'set null',
    }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'restrict' }),
    clientId: uuid('client_id').references(() => clients.id, {
      onDelete: 'restrict',
    }),
    orderId: uuid('order_id').references(() => orders.id, {
      onDelete: 'restrict',
    }),
    departmentId: uuid('department_id').references(() => departments.id, {
      onDelete: 'restrict',
    }),
    ngQty: numeric('ng_qty', { precision: 18, scale: 3, mode: 'number' })
      .notNull()
      .default(0),
    reworkQty: numeric('rework_qty', {
      precision: 18,
      scale: 3,
      mode: 'number',
    })
      .notNull()
      .default(0),
    remakeQty: numeric('remake_qty', {
      precision: 18,
      scale: 3,
      mode: 'number',
    })
      .notNull()
      .default(0),
    reworkOperationIds: uuid('rework_operation_ids')
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    defectDescription: varchar('defect_description', { length: 1000 }),
    rootCause: text('root_cause'),
    correctiveAction: text('corrective_action'),
    preventiveAction: text('preventive_action'),
    rejectionReason: varchar('rejection_reason', { length: 1000 }),
    submittedBy: uuid('submitted_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    submittedAt: timestamp('submitted_at'),
    approvedBy: uuid('approved_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    approvedAt: timestamp('approved_at'),
    closedAt: timestamp('closed_at'),
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
    index('idx_ncrs_status').on(table.status),
    index('idx_ncrs_type').on(table.type),
    index('idx_ncrs_quality_inspection_id').on(table.qualityInspectionId),
    index('idx_ncrs_production_job_id').on(table.productionJobId),
    index('idx_ncrs_item_id').on(table.itemId),
    index('idx_ncrs_client_id').on(table.clientId),
    index('idx_ncrs_order_id').on(table.orderId),
    index('idx_ncrs_department_id').on(table.departmentId),
    index('idx_ncrs_parent_ncr_id').on(table.parentNcrId),
    index('idx_ncrs_created_at').on(table.createdAt),
    check(
      'chk_ncrs_quantities',
      sql`ng_qty >= 0 AND rework_qty >= 0 AND remake_qty >= 0 AND rework_qty + remake_qty <= ng_qty`,
    ),
    check(
      'chk_ncrs_customer_client',
      sql`type <> 'CUSTOMER' OR client_id IS NOT NULL`,
    ),
  ],
);

export const ncrsRelations = relations(ncrs, ({ one, many }) => ({
  logs: many(ncrLogs),
  costLines: many(ncrCostLines),
  productionOrders: many(productionOrders),
  qualityInspection: one(qualityInspections, {
    fields: [ncrs.qualityInspectionId],
    references: [qualityInspections.id],
  }),
  productionJob: one(productionJobs, {
    fields: [ncrs.productionJobId],
    references: [productionJobs.id],
  }),
  item: one(items, { fields: [ncrs.itemId], references: [items.id] }),
  client: one(clients, { fields: [ncrs.clientId], references: [clients.id] }),
  order: one(orders, { fields: [ncrs.orderId], references: [orders.id] }),
  department: one(departments, {
    fields: [ncrs.departmentId],
    references: [departments.id],
  }),
  creatorBy: one(users, { fields: [ncrs.createdBy], references: [users.id] }),
  approverBy: one(users, {
    fields: [ncrs.approvedBy],
    references: [users.id],
  }),
}));

export type NcrSelect = typeof ncrs.$inferSelect;
