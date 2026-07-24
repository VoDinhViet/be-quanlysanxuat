import { relations, sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { countries } from './countries';
import { credentials } from './credentials';
import { files } from './files';
import { supplierGroups } from './supplier-groups';

export enum SupplierStatus {
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  STOPPED = 'STOPPED',
}

export const supplierStatusEnum = pgEnum('supplier_status', [
  SupplierStatus.ACTIVE,
  SupplierStatus.PAUSED,
  SupplierStatus.STOPPED,
]);

export enum SupplierType {
  INDIVIDUAL = 'INDIVIDUAL',
  COMPANY = 'COMPANY',
  HOUSEHOLD = 'HOUSEHOLD',
}

export const supplierTypeEnum = pgEnum('supplier_type', [
  SupplierType.INDIVIDUAL,
  SupplierType.COMPANY,
  SupplierType.HOUSEHOLD,
]);

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

export const suppliers = pgTable(
  'suppliers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: varchar('code', { length: 50 }).notNull().unique(),
    name: varchar('name', { length: 255 }).notNull(),
    supplierGroupId: uuid('supplier_group_id')
      .notNull()
      .references(() => supplierGroups.id, { onDelete: 'restrict' }),
    type: supplierTypeEnum('type').notNull(),
    taxCode: varchar('tax_code', { length: 50 }).notNull().unique(),
    phoneNumber: varchar('phone_number', { length: 30 }).notNull(),
    email: varchar('email', { length: 255 }),
    address: varchar('address', { length: 500 }).notNull(),
    note: varchar('note', { length: 1000 }),
    logoFileId: uuid('logo_file_id').references(() => files.id, {
      onDelete: 'set null',
    }),
    countryId: uuid('country_id').references(() => countries.id, {
      onDelete: 'set null',
    }),

    // Other information
    rating: integer('rating'),
    status: supplierStatusEnum('status')
      .notNull()
      .default(SupplierStatus.ACTIVE),
    internalNote: varchar('internal_note', { length: 1000 }),

    createdBy: uuid('created_by').references(() => credentials.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp('deleted_at'),
  },
  (table) => [
    index('idx_suppliers_supplier_group_id').on(table.supplierGroupId),
    index('idx_suppliers_country_id').on(table.countryId),
    index('idx_suppliers_logo_file_id').on(table.logoFileId),
    index('idx_suppliers_created_by').on(table.createdBy),
    index('idx_suppliers_status')
      .on(table.status)
      .where(sql`deleted_at IS NULL`),
  ],
);

/**
 * Join table onto the `files` registry, same shape as `material_attachments`. It deliberately
 * stores nothing but the link: url/filename/mimetype/size live on `files`, so attachments get
 * magic-byte validation, signed URLs and orphan sweeping for free instead of being a second,
 * weaker file registry.
 */
export const supplierAttachments = pgTable(
  'supplier_attachments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => suppliers.id, { onDelete: 'cascade' }),
    fileId: uuid('file_id')
      .notNull()
      .references(() => files.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_supplier_attachments_supplier_id').on(table.supplierId),
    index('idx_supplier_attachments_file_id').on(table.fileId),
  ],
);

/** 1-many with suppliers: a supplier can have multiple representatives, replace-all on update. */
export const supplierRepresentatives = pgTable(
  'supplier_representatives',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => suppliers.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    phoneNumber: varchar('phone_number', { length: 30 }),
    isPrimary: boolean('is_primary').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_supplier_representatives_supplier_id').on(table.supplierId),
  ],
);

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

export const suppliersRelations = relations(suppliers, ({ one, many }) => ({
  group: one(supplierGroups, {
    fields: [suppliers.supplierGroupId],
    references: [supplierGroups.id],
  }),
  country: one(countries, {
    fields: [suppliers.countryId],
    references: [countries.id],
  }),
  creator: one(credentials, {
    fields: [suppliers.createdBy],
    references: [credentials.id],
  }),
  logoFile: one(files, {
    fields: [suppliers.logoFileId],
    references: [files.id],
  }),
  attachments: many(supplierAttachments),
  representatives: many(supplierRepresentatives),
  payment: one(supplierPaymentInfo, {
    fields: [suppliers.id],
    references: [supplierPaymentInfo.supplierId],
  }),
}));

export const supplierAttachmentsRelations = relations(
  supplierAttachments,
  ({ one }) => ({
    supplier: one(suppliers, {
      fields: [supplierAttachments.supplierId],
      references: [suppliers.id],
    }),
    file: one(files, {
      fields: [supplierAttachments.fileId],
      references: [files.id],
    }),
  }),
);

export const supplierRepresentativesRelations = relations(
  supplierRepresentatives,
  ({ one }) => ({
    supplier: one(suppliers, {
      fields: [supplierRepresentatives.supplierId],
      references: [suppliers.id],
    }),
  }),
);

export const supplierPaymentInfoRelations = relations(
  supplierPaymentInfo,
  ({ one }) => ({
    supplier: one(suppliers, {
      fields: [supplierPaymentInfo.supplierId],
      references: [suppliers.id],
    }),
  }),
);
