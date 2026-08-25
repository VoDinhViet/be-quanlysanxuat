import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  index,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { roles } from './roles';
import { users } from './users';

/**
 * Login credentials only — personal/HR info (name, gender, DOB, phone) lives on `users`. Mỗi
 * credential bắt buộc gắn đúng một `users` (`userId` NOT NULL, unique) — không có khái niệm
 * "admin-only login" nữa, xem `docs/domains/identity-access.md`.
 *
 * Rules:
 * - Authorization is anchored here: `roleId` links the login identity (the JWT `sub`) to a role,
 *   so the permission layer resolves permissions straight from the token subject without needing
 *   to read `users`.
 * - `onDelete: 'restrict'` trên `userId` — không có route xoá `users` nào tồn tại, đây là lưới an
 *   toàn: không cho một `users` biến mất trong khi vẫn còn credential trỏ vào.
 * - `isProtected` ẩn đúng tài khoản đó khỏi `GET /users` — cờ trên credential, độc lập với
 *   `roles.isProtected` (ẩn role khỏi `GET /roles`), vì đổi role của một tài khoản không nên tự
 *   động đổi việc nó có bị ẩn khỏi danh sách hay không.
 */
export const credentials = pgTable(
  'credentials',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: 'restrict' }),
    // Không `.unique()` trên chính cột — đăng nhập so khớp `lower(username)` (BUG-080), nên chặn
    // trùng phải cùng quy tắc, xem `uq_credentials_username_lower` bên dưới.
    username: varchar('username', { length: 100 }).notNull(),
    email: varchar('email', { length: 255 }).notNull().unique(),
    password: varchar('password', { length: 255 }).notNull(),
    roleId: uuid('role_id').references(() => roles.id, {
      onDelete: 'set null',
    }),
    credentialEnabled: boolean('credential_enabled').default(true).notNull(),
    isProtected: boolean('is_protected').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('idx_credentials_role_id').on(table.roleId),
    uniqueIndex('uq_credentials_username_lower').on(
      sql`lower(${table.username})`,
    ),
  ],
);

export const credentialsRelations = relations(credentials, ({ one }) => ({
  role: one(roles, {
    fields: [credentials.roleId],
    references: [roles.id],
  }),
  user: one(users, {
    fields: [credentials.userId],
    references: [users.id],
  }),
}));

export type CredentialSelect = typeof credentials.$inferSelect;
