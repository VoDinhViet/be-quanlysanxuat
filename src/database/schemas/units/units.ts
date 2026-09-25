import { pgEnum, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

/** Nhóm đại lượng của đơn vị tính — chỉ để phân loại/lọc trên màn quản lý danh mục, không dùng
 * để quy đổi (quy đổi theo từng sản phẩm nằm ở `item_units`). */
export enum UnitType {
  QUANTITY = 'QUANTITY',
  WEIGHT = 'WEIGHT',
  LENGTH = 'LENGTH',
  VOLUME = 'VOLUME',
}

export const unitTypeEnum = pgEnum('unit_type', [
  UnitType.QUANTITY,
  UnitType.WEIGHT,
  UnitType.LENGTH,
  UnitType.VOLUME,
]);

export enum UnitStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

export const unitStatusEnum = pgEnum('unit_status', [
  UnitStatus.ACTIVE,
  UnitStatus.INACTIVE,
]);

/** Units of measure ("đơn vị tính"/ĐVT), shared across every entity that needs one —
 * deliberately one table rather than per-entity tables, so a unit keeps a single identity and a
 * BOM/inventory module can tell a DIRECT item in `Kg` and a product in `Kg` are the same unit. */
export const units = pgTable('units', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: varchar('code', { length: 50 }).notNull().unique(),
  name: varchar('name', { length: 100 }).notNull(),
  type: unitTypeEnum('type').notNull().default(UnitType.QUANTITY),
  status: unitStatusEnum('status').notNull().default(UnitStatus.ACTIVE),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export type UnitSelect = typeof units.$inferSelect;
