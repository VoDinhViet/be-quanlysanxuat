import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { clients } from './clients';

/** 1-many with clients: a client can have multiple contacts, replace-all on update. */
export const clientContacts = pgTable(
  'client_contacts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    position: varchar('position', { length: 255 }),
    phoneNumber: varchar('phone_number', { length: 30 }),
    email: varchar('email', { length: 255 }),
    note: varchar('note', { length: 500 }),
    isPrimary: boolean('is_primary').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('idx_client_contacts_client_id').on(table.clientId)],
);

export const clientContactsRelations = relations(clientContacts, ({ one }) => ({
  client: one(clients, {
    fields: [clientContacts.clientId],
    references: [clients.id],
  }),
}));
