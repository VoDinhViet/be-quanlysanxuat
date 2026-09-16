import {
  bomItems,
  bomOperations,
  type FileSelect,
  type OperationSelect,
  type UnitSelect,
} from '../../../database/schemas';

/** Shape of one `bom_items` row as `BomsService.getBom`'s SQL query already returns it — node
 * COMPONENT hoặc lá CONSUMABLE theo `type`. `code`/`name` đã coalesce (COMPONENT: cột trên dòng, CONSUMABLE: từ `items`)
 * nên không còn nullable như cột gốc; `revision`/`unit`/`image` chỉ có với CONSUMABLE (join `items`
 * là left join). */
export type BomItem = Omit<typeof bomItems.$inferSelect, 'code' | 'name'> & {
  code: string;
  name: string;
  revision: string | null;
  image: FileSelect | null;
  unit: UnitSelect | null;
  drawing: FileSelect | null;
};

/** Shape of one `bom_operations` row as `BomsService`'s batched as-used routing query returns it
 * (joined with its `operation`) — embedded raw onto each node's `operations` before the final
 * `plainToInstance(BomItemResDto, ...)` transform maps it into `BomOperationResDto[]`. */
export type BomOperation = typeof bomOperations.$inferSelect & {
  operation: OperationSelect;
};
