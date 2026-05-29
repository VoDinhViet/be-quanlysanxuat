import { date, pgEnum, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

import { roles } from './rbac/roles';

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

export enum UserGender {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
  OTHER = 'OTHER',
}

export const userStatusEnum = pgEnum('user_status', [UserStatus.ACTIVE, UserStatus.INACTIVE]);
export const userGenderEnum = pgEnum('user_gender', [
  UserGender.MALE,
  UserGender.FEMALE,
  UserGender.OTHER,
]);

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  password: varchar('password', { length: 255 }).notNull(),
  fullName: varchar('full_name', { length: 255 }),
  phoneNumber: varchar('phone_number', { length: 30 }),
  dateOfBirth: date('date_of_birth', { mode: 'date' }),
  gender: userGenderEnum('gender'),
  roleId: uuid('role_id').references(() => roles.id, { onDelete: 'set null' }),
  status: userStatusEnum('status').notNull().default(UserStatus.ACTIVE),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});
