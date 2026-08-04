import {
  bomItems,
  files,
  operations,
  routingSteps,
  units,
} from '../../../database/schemas';

type File = typeof files.$inferSelect;
type Unit = typeof units.$inferSelect;
type RoutingStep = typeof routingSteps.$inferSelect;
type Operation = typeof operations.$inferSelect;
// Tên `BomItem` (đúng chuẩn số ít của bảng `bomItems`, cùng khuôn `File`/`Unit`/`RoutingStep`) đã
// dành cho type export bên dưới (shape đã join thêm — cái thật sự lưu thông trong `BomsService`),
// nên alias raw phải mang tên khác để tránh trùng.

/** Shape of one `bom_items` row as `BomsService.getBom`'s SQL query already returns it — bảng giờ
 * thuần cấu trúc WIP (không còn coalesce product/material), left join thẳng `products`. Lấy nguyên
 * cột `bom_items` cho gọn — vài cột (`bomId`/`path`/`drawingFileId`/`createdBy`/`createdAt`/
 * `updatedAt`) thật ra không nằm trong query, chỉ `code`/`name`/`unit`/`image`/`drawing` mới là
 * cột join thêm thật sự dùng. */
export type BomItem = typeof bomItems.$inferSelect & {
  code: string;
  name: string;
  image: File | null;
  unit: Unit;
  drawing: File | null;
};

/** Shape of one `routing_steps` row as `BomsService`'s batched as-used routing query returns it
 * (joined with its `operation`) — embedded raw onto each node's `operations` before the final
 * `plainToInstance(BomItemResDto, ...)` transform maps it into `RoutingStepResDto[]`. */
export type BomTreeOperationRow = RoutingStep & {
  operation: Operation;
};
