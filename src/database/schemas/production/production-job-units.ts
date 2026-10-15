import { relations } from 'drizzle-orm';
import { pgTable, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core';

import { units } from '../units/units';

/**
 * Snapshot **mã/tên ĐVT** đóng băng lúc dựng snapshot Job — song song với `productionJobItems`,
 * cùng ngữ nghĩa SCD type-2, ghi qua `getOrCreateJobUnitIds` (`production-job-snapshot.query.ts`).
 *
 * Rules:
 * - Khoá định danh là bộ ba `(unitId, code, name)`, cả ba `NOT NULL`; lý lẽ đầy đủ ở doc
 *   `productionJobItems`.
 * - **Không tham chiếu `productionJobItems`.** `productionJobIssues` giữ hai FK song song, cố ý:
 *   đổi ĐVT của một vật tư (mã/tên vật tư giữ nguyên) chỉ sinh dòng mới ở bảng này. Lồng bảng này
 *   dưới bảng kia sẽ nhân đôi cả hai.
 * - `name` là `varchar(100)` khớp `units.name`.
 * - Bất biến sau khi ghi, không `updatedAt` — cùng lý lẽ `productionJobItems`.
 */
export const productionJobUnits = pgTable(
  'production_job_units',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    unitId: uuid('unit_id')
      .notNull()
      .references(() => units.id, { onDelete: 'restrict' }),
    code: varchar('code', { length: 50 }).notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    unique('uq_production_job_units_unit_code_name').on(
      table.unitId,
      table.code,
      table.name,
    ),
  ],
);

export const productionJobUnitsRelations = relations(
  productionJobUnits,
  ({ one }) => ({
    unit: one(units, {
      fields: [productionJobUnits.unitId],
      references: [units.id],
    }),
  }),
);

export type ProductionJobUnitSelect = typeof productionJobUnits.$inferSelect;
