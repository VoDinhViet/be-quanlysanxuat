import {
  bomItems,
  type FileSelect,
  type UnitSelect,
} from '../../../database/schemas';

/** Shape of one `bom_items` row as `BomsService.getBomItem`'s SQL query already returns it — node
 * COMPONENT hoặc lá DIRECT theo `type`. `code`/`name` đã coalesce (COMPONENT: cột trên dòng, DIRECT: từ `items`)
 * nên không còn nullable như cột gốc; `revision`/`image` chỉ có với DIRECT (join `items` là
 * left join); `unit` join theo `coalesce(items.unitId, bomItems.unitId)` nên có cả ở COMPONENT nếu
 * đã gán riêng. */
export type BomItem = Omit<typeof bomItems.$inferSelect, 'code' | 'name'> & {
  code: string;
  name: string;
  revision: string | null;
  image: FileSelect | null;
  unit: UnitSelect | null;
};
