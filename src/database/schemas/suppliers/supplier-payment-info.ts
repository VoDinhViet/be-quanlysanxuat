import { relations } from 'drizzle-orm';
import {
  bigint,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { suppliers } from './suppliers';

export enum PaymentMethod {
  CASH = 'CASH',
  BANK_TRANSFER = 'BANK_TRANSFER',
}

export const paymentMethodEnum = pgEnum('payment_method', [
  PaymentMethod.CASH,
  PaymentMethod.BANK_TRANSFER,
]);

export enum PaymentTerm {
  IMMEDIATE = 'IMMEDIATE',
  NET_15 = 'NET_15',
  NET_30 = 'NET_30',
  NET_60 = 'NET_60',
}

export const paymentTermEnum = pgEnum('payment_term', [
  PaymentTerm.IMMEDIATE,
  PaymentTerm.NET_15,
  PaymentTerm.NET_30,
  PaymentTerm.NET_60,
]);

/** 1-1 with suppliers: always created alongside the supplier row (see SuppliersService.createSupplier). */
export const supplierPaymentInfo = pgTable('supplier_payment_info', {
  id: uuid('id').defaultRandom().primaryKey(),
  supplierId: uuid('supplier_id')
    .notNull()
    .unique()
    .references(() => suppliers.id, { onDelete: 'cascade' }),
  bankName: varchar('bank_name', { length: 255 }),
  bankAccountNumber: varchar('bank_account_number', { length: 50 }),
  bankAccountHolder: varchar('bank_account_holder', { length: 255 }),
  bankBranch: varchar('bank_branch', { length: 255 }),
  defaultPaymentMethod: paymentMethodEnum('default_payment_method'),
  defaultPaymentTerm: paymentTermEnum('default_payment_term'),
  creditLimit: bigint('credit_limit', { mode: 'number' }),
  creditLimitStartDate: timestamp('credit_limit_start_date'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export const supplierPaymentInfoRelations = relations(
  supplierPaymentInfo,
  ({ one }) => ({
    supplier: one(suppliers, {
      fields: [supplierPaymentInfo.supplierId],
      references: [suppliers.id],
    }),
  }),
);
