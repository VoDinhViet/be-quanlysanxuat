import { pgEnum, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

import { roles } from './rbac/roles';

export enum UserStatus {
  Active = 'active',
  Inactive = 'inactive',
}

export const userStatusEnum = pgEnum('user_status', [UserStatus.Active, UserStatus.Inactive]);

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  password: varchar('password', { length: 255 }).notNull(),
  fullName: varchar('full_name', { length: 255 }),
  roleId: uuid('role_id').references(() => roles.id, { onDelete: 'set null' }),
  status: userStatusEnum('status').notNull().default(UserStatus.Active),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
