import { relations, sql } from 'drizzle-orm';
import {
  index,
  integer,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { countries } from '../countries';
import { files } from '../files';
import { supplierAttachments } from './supplier-attachments';
import { supplierGroups } from './supplier-groups';
import { supplierPaymentInfo } from './supplier-payment-info';
import { supplierRepresentatives } from './supplier-representatives';
import { users } from '../identity-access/users';

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

    createdBy: uuid('created_by').references(() => users.id, {
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

export const suppliersRelations = relations(suppliers, ({ one, many }) => ({
  group: one(supplierGroups, {
    fields: [suppliers.supplierGroupId],
    references: [supplierGroups.id],
  }),
  country: one(countries, {
    fields: [suppliers.countryId],
    references: [countries.id],
  }),
  creatorBy: one(users, {
    fields: [suppliers.createdBy],
    references: [users.id],
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
