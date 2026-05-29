import { pgEnum, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export enum ClientType {
  Individual = 'INDIVIDUAL',
  Company = 'COMPANY',
}

export const clientTypeEnum = pgEnum('client_type', [ClientType.Individual, ClientType.Company]);

export const clients = pgTable('clients', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: varchar('code', { length: 50 }).notNull(),
  fullName: varchar('full_name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }),
  phoneNumber: varchar('phone_number', { length: 30 }),
  clientType: clientTypeEnum('client_type').notNull().default(ClientType.Individual),
  taxCode: varchar('tax_code', { length: 50 }),
  companyName: varchar('company_name', { length: 255 }),
  address: text('address'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

export type Client = typeof clients.$inferSelect;
export type NewClient = typeof clients.$inferInsert;
