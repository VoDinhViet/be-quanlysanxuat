import { relations, sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  numeric,
  pgTable,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { suppliers } from '../suppliers/suppliers';
import { users } from '../identity-access/users';
import { purchaseQuotationItems } from './purchase-quotation-items';

/**
 * Giá một NCC báo cho một dòng vật tư. `unitPrice` nullable tới khi NCC được nhập giá. `selectedAt`
 * có giá trị nghĩa là NCC này thắng thầu cho vật tư đó — unique index từng phần bên dưới chặn hơn
 * một NCC thắng thầu cho cùng một `quotationItemId` ở tầng DB (`docs/domains/purchasing.md`).
 */
export const purchaseQuotationItemSuppliers = pgTable(
  'purchase_quotation_item_suppliers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    quotationItemId: uuid('quotation_item_id')
      .notNull()
      .references(() => purchaseQuotationItems.id, { onDelete: 'cascade' }),
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => suppliers.id, { onDelete: 'restrict' }),
    unitPrice: numeric('unit_price', {
      precision: 18,
      scale: 2,
      mode: 'number',
    }),
    leadTimeDays: integer('lead_time_days'),
    note: varchar('note', { length: 500 }),
    selectedBy: uuid('selected_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    selectedAt: timestamp('selected_at'),
  },
  (table) => [
    index('idx_purchase_quotation_item_suppliers_quotation_item_id').on(
      table.quotationItemId,
    ),
    index('idx_purchase_quotation_item_suppliers_supplier_id').on(
      table.supplierId,
    ),
    unique('uq_purchase_quotation_item_suppliers_item_supplier').on(
      table.quotationItemId,
      table.supplierId,
    ),
    // Chặn hơn một NCC thắng thầu/vật tư — partial index, KHÁC loại partial index chỉ để tăng tốc
    // (`.claude/rules/database.md`): index này thật sự enforce.
    uniqueIndex('uq_purchase_quotation_item_suppliers_winner_per_item')
      .on(table.quotationItemId)
      .where(sql`selected_at IS NOT NULL`),
    check(
      'chk_purchase_quotation_item_suppliers_unit_price',
      sql`unit_price IS NULL OR unit_price >= 0`,
    ),
  ],
);

export const purchaseQuotationItemSuppliersRelations = relations(
  purchaseQuotationItemSuppliers,
  ({ one }) => ({
    quotationItem: one(purchaseQuotationItems, {
      fields: [purchaseQuotationItemSuppliers.quotationItemId],
      references: [purchaseQuotationItems.id],
    }),
    supplier: one(suppliers, {
      fields: [purchaseQuotationItemSuppliers.supplierId],
      references: [suppliers.id],
    }),
    selectorBy: one(users, {
      fields: [purchaseQuotationItemSuppliers.selectedBy],
      references: [users.id],
    }),
  }),
);

export type PurchaseQuotationItemSupplierSelect =
  typeof purchaseQuotationItemSuppliers.$inferSelect;
