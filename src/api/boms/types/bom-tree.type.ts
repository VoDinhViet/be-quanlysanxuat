import {
  bomItems,
  bomOperations,
  files,
  operations,
  units,
} from '../../../database/schemas';

type File = typeof files.$inferSelect;
type Unit = typeof units.$inferSelect;
type Operation = typeof operations.$inferSelect;
// Tên `BomItem`/`BomOperation` (đúng chuẩn số ít của bảng, cùng khuôn `File`/`Unit`) đã dành cho
// hai type export bên dưới (shape đã join thêm — cái thật sự lưu thông trong `BomsService`).

/** Shape of one `bom_items` row as `BomsService.getBom`'s SQL query already returns it — bảng giờ
 * thuần cấu trúc WIP (không còn coalesce product/material), left join thẳng `products`. Lấy nguyên
 * cột `bom_items` cho gọn — vài cột (`bomId`/`drawingFileId`/`createdBy`/`createdAt`/`updatedAt`)
 * thật ra không nằm trong query, chỉ `code`/`name`/`unit`/`image`/`drawing` mới là cột join thêm
 * thật sự dùng. */
export type BomItem = typeof bomItems.$inferSelect & {
  code: string;
  name: string;
  image: File | null;
  unit: Unit;
  drawing: File | null;
};

/** Shape of one `bom_operations` row as `BomsService`'s batched as-used routing query returns it
 * (joined with its `operation`) — embedded raw onto each node's `operations` before the final
 * `plainToInstance(BomItemResDto, ...)` transform maps it into `BomOperationResDto[]`. */
export type BomOperation = typeof bomOperations.$inferSelect & {
  operation: Operation;
};
