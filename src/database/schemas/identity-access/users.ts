import { relations } from 'drizzle-orm';
import {
  type AnyPgColumn,
  date,
  index,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { credentials } from './credentials';
import { departments } from '../departments';
import { files } from '../files';
import { positions } from '../positions';

export enum UserGender {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
  OTHER = 'OTHER',
}

export const userGenderEnum = pgEnum('user_gender', [
  UserGender.MALE,
  UserGender.FEMALE,
  UserGender.OTHER,
]);

export enum UserStatus {
  WORKING = 'WORKING',
  RESIGNED = 'RESIGNED',
}

export const userStatusEnum = pgEnum('user_status', [
  UserStatus.WORKING,
  UserStatus.RESIGNED,
]);

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: varchar('code', { length: 50 }).notNull().unique(),
    fullName: varchar('full_name', { length: 255 }).notNull(),
    gender: userGenderEnum('gender').notNull().default(UserGender.MALE),
    dateOfBirth: date('date_of_birth', { mode: 'date' }),
    idNumber: varchar('id_number', { length: 20 }).unique(),
    phoneNumber: varchar('phone_number', { length: 30 }),
    email: varchar('email', { length: 255 }),
    address: varchar('address', { length: 500 }),
    avatarFileId: uuid('avatar_file_id').references(
      (): AnyPgColumn => files.id,
      {
        onDelete: 'set null',
      },
    ),
    departmentId: uuid('department_id')
      .notNull()
      .references(() => departments.id, { onDelete: 'restrict' }),
    positionId: uuid('position_id')
      .notNull()
      .references(() => positions.id, { onDelete: 'restrict' }),
    hireDate: date('hire_date', { mode: 'date' }).notNull(),
    note: varchar('note', { length: 1000 }),
    status: userStatusEnum('status').notNull().default(UserStatus.WORKING),
    // Self-reference — "ai đã tạo user này" (cùng khuôn `bomItems.parentId`), NULL cho user gốc
    // tạo bằng seed hoặc không rõ người tạo.
    createdBy: uuid('created_by').references((): AnyPgColumn => users.id, {
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
    index('idx_users_department_id').on(table.departmentId),
    index('idx_users_position_id').on(table.positionId),
    index('idx_users_avatar_file_id').on(table.avatarFileId),
    index('idx_users_created_by').on(table.createdBy),
  ],
);

export const usersRelations = relations(users, ({ one }) => ({
  department: one(departments, {
    fields: [users.departmentId],
    references: [departments.id],
  }),
  position: one(positions, {
    fields: [users.positionId],
    references: [positions.id],
  }),
  creatorBy: one(users, {
    fields: [users.createdBy],
    references: [users.id],
  }),
  avatarFile: one(files, {
    fields: [users.avatarFileId],
    references: [files.id],
  }),
  // Chiều ngược của `credentialsRelations.user` — FK thật (`credentials.userId`) nằm bên
  // `credentials`, khai `one()` ở cả hai phía cho quan hệ 1-1 là cách chuẩn của Drizzle khi FK
  // không nằm trên bảng đang khai relation.
  credential: one(credentials, {
    fields: [users.id],
    references: [credentials.userId],
  }),
}));

export type UserSelect = typeof users.$inferSelect;
