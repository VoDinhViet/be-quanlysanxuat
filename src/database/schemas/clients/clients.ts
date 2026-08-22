import { relations, sql } from 'drizzle-orm';
import {
  index,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { clientContacts } from './client-contacts';
import { clientGroups } from './client-groups';
import { users } from '../identity-access/users';

export enum ClientStatus {
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
}

export const clientStatusEnum = pgEnum('client_status', [
  ClientStatus.ACTIVE,
  ClientStatus.PAUSED,
]);

export const clients = pgTable(
  'clients',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: varchar('code', { length: 50 }).notNull().unique(),
    name: varchar('name', { length: 255 }).notNull(),
    clientGroupId: uuid('client_group_id')
      .notNull()
      .references(() => clientGroups.id, { onDelete: 'restrict' }),
    taxCode: varchar('tax_code', { length: 50 }),
    phoneNumber: varchar('phone_number', { length: 30 }),
    email: varchar('email', { length: 255 }),
    address: varchar('address', { length: 500 }),
    note: varchar('note', { length: 1000 }),
    status: clientStatusEnum('status').notNull().default(ClientStatus.ACTIVE),
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
    index('idx_clients_client_group_id').on(table.clientGroupId),
    index('idx_clients_created_by').on(table.createdBy),
    index('idx_clients_status')
      .on(table.status)
      .where(sql`deleted_at IS NULL`),
  ],
);

export const clientsRelations = relations(clients, ({ one, many }) => ({
  group: one(clientGroups, {
    fields: [clients.clientGroupId],
    references: [clientGroups.id],
  }),
  creatorBy: one(users, {
    fields: [clients.createdBy],
    references: [users.id],
  }),
  contacts: many(clientContacts),
}));

export type ClientSelect = typeof clients.$inferSelect;
