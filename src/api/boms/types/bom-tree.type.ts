import {
  bomItems,
  bomOperations,
  type FileSelect,
  ItemType,
  type OperationSelect,
  type UnitSelect,
} from '../../../database/schemas';

/** Shape of one `bom_items` row as `BomsService.getBom`'s SQL query already returns it — node WIP
 * hoặc lá RM, phân biệt qua `itemType` (đọc từ `items.type`, không phải cột trên chính
 * `bom_items`). Lấy nguyên cột `bom_items` cho gọn — vài cột (`bomId`/`drawingFileId`/`createdBy`/
 * `createdAt`/`updatedAt`) thật ra không nằm trong query, chỉ `code`/`name`/`unit`/`image`/
 * `drawing` mới là cột join thêm thật sự dùng. */
export type BomItem = typeof bomItems.$inferSelect & {
  itemType: ItemType;
  code: string;
  name: string;
  image: FileSelect | null;
  unit: UnitSelect;
  drawing: FileSelect | null;
};

/** Shape of one `bom_operations` row as `BomsService`'s batched as-used routing query returns it
 * (joined with its `operation`) — embedded raw onto each node's `operations` before the final
 * `plainToInstance(BomItemResDto, ...)` transform maps it into `BomOperationResDto[]`. */
export type BomOperation = typeof bomOperations.$inferSelect & {
  operation: OperationSelect;
};
