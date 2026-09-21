import { relations } from 'drizzle-orm';
import { index, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

import { departments } from './departments';

/**
 * A chức vụ (position) always belongs to exactly one phòng ban (department) — e.g. "NV Kinh
 * doanh" only makes sense within "Phòng Kinh doanh". `users.positionId` must reference a row here
 * whose `departmentId` matches `users.departmentId` (validated in `UsersService`, not a DB
 * constraint).
 */
export const positions = pgTable(
  'positions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: varchar('code', { length: 50 }).notNull().unique(),
    name: varchar('name', { length: 255 }).notNull(),
    description: varchar('description', { length: 500 }),
    departmentId: uuid('department_id')
      .notNull()
      .references(() => departments.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [index('idx_positions_department_id').on(table.departmentId)],
);

export const positionsRelations = relations(positions, ({ one }) => ({
  department: one(departments, {
    fields: [positions.departmentId],
    references: [departments.id],
  }),
}));

export type PositionSelect = typeof positions.$inferSelect;
