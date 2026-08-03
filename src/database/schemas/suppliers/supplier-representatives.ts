import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { suppliers } from './suppliers';

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

export const supplierRepresentativesRelations = relations(
  supplierRepresentatives,
  ({ one }) => ({
    supplier: one(suppliers, {
      fields: [supplierRepresentatives.supplierId],
      references: [suppliers.id],
    }),
  }),
);
