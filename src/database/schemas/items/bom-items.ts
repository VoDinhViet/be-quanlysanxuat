import { relations, sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
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
 * đúng 1 sản phẩm — không tái sử dụng được. `DIRECT` — node lá, trỏ `items.id`
 * (`type = DIRECT`). Cấp 0 (chính item FG) không có giá trị nào ở đây — không phải một dòng
 * `bom_items`, không xuất hiện trong response `GET .../bom`
 * (`docs/decisions/level-0-outside-bom-tree-response.md`).
 */
export enum BomType {
  COMPONENT = 'COMPONENT',
  DIRECT = 'DIRECT',
}

export const bomTypeEnum = pgEnum('bom_node_type', [
  BomType.COMPONENT,
  BomType.DIRECT,
]);

/**
 * One line of the BOM tree — a `COMPONENT` sub-assembly node (private to this tree, no `items`
 * row) or a `DIRECT` leaf (`itemId`, không còn bảng `bom_materials` riêng — xem
 * `docs/decisions/items-merge.md`). `parentId` NULL nghĩa là node nằm ngay dưới Cấp 0 (dòng ảo,
 * không lưu ở đây — xem `docs/decisions/bom-header-as-level-0-anchor.md`). `level` stores 1-based
 * depth from Cấp 0, read straight into the response.
 *
 * Rules:
 * - Một node DIRECT là lá bắt buộc — không được có con, không được gắn `bom_operations`
 *   (`BomsService`).
 * - Đúng 1 trong 2 hình dạng, ép bởi `chk_bom_items_node_shape`: `DIRECT` → `itemId` có,
 *   `code`/`name`/`unitId`/`imageFileId` không; `COMPONENT` → ngược lại, `unitId` (ĐVT riêng)
 *   và `imageFileId` (ảnh riêng) tuỳ chọn.
 */
export const bomItems = pgTable(
  'bom_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    bomId: uuid('bom_id')
      .notNull()
      .references(() => boms.id, { onDelete: 'cascade' }),
    // Self-referencing forward reference — same AnyPgColumn thunk as items.clonedFromItemId.
    // NULL nghĩa là node nằm ngay dưới Cấp 0 (dòng ảo, không phải một bom_items thật — xem doc
    // comment phía trên).
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
    // chung. NULL ở `DIRECT` (đọc từ `items` join thay vì lưu ở đây).
    code: varchar('code', { length: 50 }),
    name: varchar('name', { length: 255 }),
    // Chỉ node `COMPONENT` dùng (không gắn `items` nên không có unit để join) — chọn tự do. NULL bắt buộc ở `DIRECT` (đọc `unit` qua join item).
    unitId: uuid('unit_id').references(() => units.id, {
      onDelete: 'restrict',
    }),
    // Ảnh riêng — chỉ node `COMPONENT` (không trỏ `items` nên không có ảnh để join). NULL bắt buộc
    // ở `DIRECT` (đọc `image` qua join item).
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
    // Chỉ `DIRECT` — vật tư ngoài cấu trúc: được gắn cạnh node COMPONENT (miễn `E273`) và không bị
    // xoá ngầm khi node cha có thêm con COMPONENT (`docs/domains/product-structure.md`).
    isOffStructure: boolean('is_off_structure').notNull().default(false),
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
      sql`(type = 'DIRECT' AND item_id IS NOT NULL AND code IS NULL AND name IS NULL
          AND unit_id IS NULL AND image_file_id IS NULL)
        OR (type = 'COMPONENT' AND item_id IS NULL AND code IS NOT NULL AND name IS NOT NULL)`,
    ),
    check(
      'chk_bom_items_off_structure_direct',
      sql`NOT is_off_structure OR type = 'DIRECT'`,
    ),
    // Lưới an toàn tầng DB cho `BomsService.ensureBomItemNotDuplicate` — cùng `itemId` không được
    // xuất hiện hai lần dưới cùng node cha. Tách theo NULL ≠ NULL của Postgres vì `parent_id NULL`
    // (ngay dưới Cấp 0) không được coi là "cùng cha" với chính nó qua so sánh `=` thường.
    uniqueIndex('uq_bom_items_bom_item_no_parent')
      .on(table.bomId, table.itemId)
      .where(sql`parent_id IS NULL`),
    uniqueIndex('uq_bom_items_bom_parent_item')
      .on(table.bomId, table.parentId, table.itemId)
      .where(sql`parent_id IS NOT NULL`),
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
