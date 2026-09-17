import { relations, sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  check,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { boms } from './boms';
import { files } from '../files';
import { items } from './items';
import { units } from '../units/units';
import { users } from '../identity-access/users';

/**
 * `COMPONENT` — node cấu trúc con (thay cho WIP cũ, `docs/decisions/wip-removal.md`): không trỏ
 * `items`, mang `code`/`name` nhập trực tiếp trên chính dòng, riêng cho vị trí đó trong cây của
 * đúng 1 sản phẩm — không tái sử dụng được. `CONSUMABLE` — node lá, trỏ `items.id`
 * (`type = CONSUMABLE`). `ROOT` — đúng 1 dòng mỗi `bom`, đại diện chính sản phẩm FG ("Cấp 0"); trỏ
 * `items.id` như CONSUMABLE (cùng cách đọc `code`/`name`/`unit`/`image` qua join) nhưng không phải
 * lá — nhận COMPONENT/CONSUMABLE làm con trực tiếp và gắn được `bom_operations` như COMPONENT.
 * Sinh tự động khi tạo `bom` (`BomsService.getOrCreateBomId`), không tạo/xoá được qua API
 * bom-items thường (xem `docs/decisions/root-bom-item.md`).
 */
export enum BomType {
  COMPONENT = 'COMPONENT',
  CONSUMABLE = 'CONSUMABLE',
  ROOT = 'ROOT',
}

export const bomTypeEnum = pgEnum('bom_node_type', [
  BomType.COMPONENT,
  BomType.CONSUMABLE,
  BomType.ROOT,
]);

/**
 * One line of the BOM tree — a `ROOT` node (the FG item itself, "Cấp 0"), a `COMPONENT`
 * sub-assembly node (private to this tree, no `items` row), or a `CONSUMABLE` leaf (`itemId`,
 * không còn bảng `bom_materials` riêng — xem `docs/decisions/items-merge.md`). Mọi node khác ROOT
 * đều có `parentId` trỏ tới một node khác trong cùng `bom` (ROOT là gốc thật của cây — không còn
 * node nào có `parentId = null` ngoài chính nó, xem `docs/decisions/root-bom-item.md`). `level`
 * stores 0-based depth from ROOT, read straight into the response.
 *
 * Rules:
 * - Một node CONSUMABLE là lá bắt buộc — không được có con, không được gắn `bom_operations`
 *   (`BomsService`).
 * - Đúng 1 trong 3 hình dạng, ép bởi `chk_bom_items_node_shape`: `CONSUMABLE` → `itemId` có,
 *   `code`/`name`/`unitId`/`imageFileId` không; `COMPONENT` → ngược lại, `unitId` (ĐVT riêng,
 *   không validate theo `unit_scopes`) và `imageFileId` (ảnh riêng) tuỳ chọn; `ROOT` → `itemId`
 *   có (như CONSUMABLE), `code`/`name`/`unitId`/`imageFileId` không, và `parentId` bắt buộc null.
 */
export const bomItems = pgTable(
  'bom_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    bomId: uuid('bom_id')
      .notNull()
      .references(() => boms.id, { onDelete: 'cascade' }),
    // Self-referencing forward reference — same AnyPgColumn thunk as items.clonedFromItemId.
    // Null only for the one ROOT row of each bom — every other node (including what used to be
    // "top-level") now points at that ROOT row (see doc comment above,
    // `docs/decisions/root-bom-item.md`).
    parentId: uuid('parent_id').references((): AnyPgColumn => bomItems.id, {
      onDelete: 'cascade',
    }),
    type: bomTypeEnum('type').notNull(),
    // `restrict`: một item đang được BOM tham chiếu không thể bị xoá cứng ra khỏi dưới chân nó.
    // NULL cho node `COMPONENT` — node đó không phải một item.
    itemId: uuid('item_id').references(() => items.id, {
      onDelete: 'restrict',
    }),
    // Chỉ node `COMPONENT` dùng — mã/tên nhập tay riêng cho vị trí này, không phải danh mục dùng
    // chung. NULL cho cả `CONSUMABLE` và `ROOT` (đọc từ `items` join thay vì lưu ở đây).
    code: varchar('code', { length: 50 }),
    name: varchar('name', { length: 255 }),
    // Chỉ node `COMPONENT` dùng (không gắn `items` nên không có unit để join) — chọn tự do, không
    // validate theo `unit_scopes`. NULL bắt buộc ở `CONSUMABLE`/`ROOT` (đọc `unit` qua join item).
    unitId: uuid('unit_id').references(() => units.id, {
      onDelete: 'restrict',
    }),
    // Ảnh riêng — chỉ node `COMPONENT` (không trỏ `items` nên không có ảnh để join). NULL bắt buộc
    // ở `CONSUMABLE`/`ROOT` (đọc `image` qua join item).
    imageFileId: uuid('image_file_id').references(() => files.id, {
      onDelete: 'set null',
    }),
    quantity: numeric('quantity', {
      precision: 12,
      scale: 3,
      mode: 'number',
    }).notNull(),
    level: integer('level').notNull().default(1),
    // Deterministic sibling ordering — the UI's "STT" (e.g. "1.0.3") is presentational, derived
    // from tree position + this.
    sortOrder: integer('sort_order').notNull().default(0),
    note: varchar('note', { length: 1000 }),
    createdBy: uuid('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('idx_bom_items_bom_id').on(table.bomId),
    index('idx_bom_items_parent_id').on(table.parentId),
    index('idx_bom_items_item_id').on(table.itemId),
    index('idx_bom_items_created_by').on(table.createdBy),
    index('idx_bom_items_unit_id').on(table.unitId),
    index('idx_bom_items_image_file_id').on(table.imageFileId),
    check('chk_bom_items_quantity_positive', sql`quantity > 0`),
    check(
      'chk_bom_items_node_shape',
      sql`(type = 'CONSUMABLE' AND item_id IS NOT NULL AND code IS NULL AND name IS NULL
          AND unit_id IS NULL AND image_file_id IS NULL)
        OR (type = 'COMPONENT' AND item_id IS NULL AND code IS NOT NULL AND name IS NOT NULL)
        OR (type = 'ROOT' AND item_id IS NOT NULL AND code IS NULL AND name IS NULL
          AND parent_id IS NULL AND unit_id IS NULL AND image_file_id IS NULL)`,
    ),
    // Lưới an toàn tầng DB cho `BomsService.ensureBomItemNotDuplicate` — cùng `itemId` không được
    // xuất hiện hai lần dưới cùng node cha. Mọi node khác ROOT nay luôn có `parent_id` (ROOT là
    // gốc thật của cây — xem doc comment phía trên), nên một index duy nhất trên
    // `(bom_id, parent_id, item_id)` là đủ, không còn cần tách theo NULL ≠ NULL của Postgres như
    // trước `docs/decisions/root-bom-item.md`. Node `COMPONENT` (`itemId` luôn NULL) tự động
    // không bị index này chặn — chỉ còn ý nghĩa cho CONSUMABLE.
    uniqueIndex('uq_bom_items_bom_parent_item').on(
      table.bomId,
      table.parentId,
      table.itemId,
    ),
    // Đúng 1 dòng ROOT mỗi bom.
    uniqueIndex('uq_bom_items_bom_root')
      .on(table.bomId)
      .where(sql`type = 'ROOT'`),
  ],
);

export type BomItemSelect = typeof bomItems.$inferSelect;

export const bomItemsRelations = relations(bomItems, ({ one }) => ({
  bom: one(boms, {
    fields: [bomItems.bomId],
    references: [boms.id],
  }),
  item: one(items, {
    fields: [bomItems.itemId],
    references: [items.id],
  }),
  unit: one(units, {
    fields: [bomItems.unitId],
    references: [units.id],
  }),
  imageFile: one(files, {
    fields: [bomItems.imageFileId],
    references: [files.id],
  }),
  creatorBy: one(users, {
    fields: [bomItems.createdBy],
    references: [users.id],
  }),
}));
