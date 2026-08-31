import { relations, sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  index,
  numeric,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { clients } from '../clients/clients';
import { files } from '../files';
import { suppliers } from '../suppliers/suppliers';
import { units } from '../units/units';
import { users } from '../identity-access/users';
import { itemFiles } from './item-files';
import { itemUnits } from './item-units';

/**
 * FG (thành phẩm, gốc cây BOM của chính nó), WIP (bán thành phẩm, chỉ xuất hiện như node con trong
 * `bom_items` của một item khác), RM (vật tư, chỉ xuất hiện như node lá — không có BOM/công đoạn
 * riêng). Xem `docs/decisions/items-merge.md`.
 */
export enum ItemType {
  FG = 'FG',
  WIP = 'WIP',
  RM = 'RM',
}

export const itemTypeEnum = pgEnum('item_type', [
  ItemType.FG,
  ItemType.WIP,
  ItemType.RM,
]);

export enum ItemStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

export const itemStatusEnum = pgEnum('item_status', [
  ItemStatus.ACTIVE,
  ItemStatus.INACTIVE,
]);

/**
 * Danh mục hàng hoá dùng chung cho cả FG/WIP/RM — gộp `products`+`materials` cũ, một bảng, một
 * module `/items` (`docs/decisions/items-merge.md`).
 *
 * Rules:
 * - `supplierId`/`minStock`/8 cột mở rộng bên dưới chỉ có ý nghĩa với RM — luôn nullable/mặc định
 *   trên FG/WIP, không tách bảng phụ.
 * - Không còn cột nhóm hàng hoá (`productGroupId`/`materialGroupId` cũ) — `type` là thứ duy nhất
 *   phân loại.
 * - `code` unique theo partial index (chỉ dòng còn sống) chứ không phải `.unique()` toàn bảng —
 *   khác quy ước chung của `.claude/rules/database.md`'s "Soft delete" (cố tình, đã bàn với người
 *   yêu cầu): một mã bị xoá mềm phải dùng lại được, vì `code` còn tự sinh (`VTxxxx`/`SPxxxx`) nên
 *   giữ mã chết vĩnh viễn sẽ làm hụt dải số một cách vô ích.
 */
export const items = pgTable(
  'items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: varchar('code', { length: 50 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    type: itemTypeEnum('type').notNull().default(ItemType.FG),
    imageFileId: uuid('image_file_id').references(() => files.id, {
      onDelete: 'set null',
    }),
    // Self-referencing forward reference — needs the explicit `AnyPgColumn` return type to break
    // TypeScript's circular inference within the same table. Lineage only ("Sao chép từ"); a clone
    // is a fully independent item.
    clonedFromItemId: uuid('cloned_from_item_id').references(
      (): AnyPgColumn => items.id,
      { onDelete: 'set null' },
    ),
    status: itemStatusEnum('status').notNull().default(ItemStatus.ACTIVE),
    note: varchar('note', { length: 1000 }),
    clientId: uuid('client_id').references(() => clients.id, {
      onDelete: 'set null',
    }),
    unitId: uuid('unit_id')
      .notNull()
      .references(() => units.id, { onDelete: 'restrict' }),

    // Chỉ RM dùng — nullable/mặc định trên FG/WIP.
    supplierId: uuid('supplier_id').references(() => suppliers.id, {
      onDelete: 'set null',
    }),
    minStock: numeric('min_stock', {
      precision: 18,
      scale: 3,
      mode: 'number',
    })
      .notNull()
      .default(0),
    materialGrade: varchar('material_grade', { length: 255 }),
    technicalStandard: varchar('technical_standard', { length: 255 }),
    dimensions: varchar('dimensions', { length: 255 }),
    specificWeight: numeric('specific_weight', {
      precision: 12,
      scale: 3,
      mode: 'number',
    }),
    colorSurface: varchar('color_surface', { length: 255 }),
    description: varchar('description', { length: 2000 }),
    origin: varchar('origin', { length: 255 }),
    leadTime: varchar('lead_time', { length: 100 }),

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
    index('idx_items_client_id').on(table.clientId),
    index('idx_items_unit_id').on(table.unitId),
    index('idx_items_supplier_id').on(table.supplierId),
    index('idx_items_cloned_from_item_id').on(table.clonedFromItemId),
    index('idx_items_created_by').on(table.createdBy),
    index('idx_items_image_file_id').on(table.imageFileId),
    index('idx_items_type').on(table.type),
    index('idx_items_status').on(table.status),
    // Partial unique index — thật sự enforce (khác partial index chỉ để tăng tốc,
    // `.claude/rules/database.md`) — chỉ chặn trùng `code` giữa các dòng còn sống.
    uniqueIndex('uq_items_code_active')
      .on(table.code)
      .where(sql`deleted_at IS NULL`),
  ],
);

export const itemsRelations = relations(items, ({ one, many }) => ({
  files: many(itemFiles),
  units: many(itemUnits),
  client: one(clients, {
    fields: [items.clientId],
    references: [clients.id],
  }),
  unit: one(units, {
    fields: [items.unitId],
    references: [units.id],
  }),
  supplier: one(suppliers, {
    fields: [items.supplierId],
    references: [suppliers.id],
  }),
  creatorBy: one(users, {
    fields: [items.createdBy],
    references: [users.id],
  }),
  imageFile: one(files, {
    fields: [items.imageFileId],
    references: [files.id],
  }),
  clonedFrom: one(items, {
    fields: [items.clonedFromItemId],
    references: [items.id],
  }),
}));

export type ItemSelect = typeof items.$inferSelect;
