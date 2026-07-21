import { Exclude, Expose } from 'class-transformer';

import { BomItemType } from '../../../database/schemas';
import {
  ClassField,
  ClassFieldOptional,
  EnumField,
  NumberField,
  StringField,
  StringFieldOptional,
  UUIDField,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';
import { BomItemUnitResDto } from './bom-item-unit.res.dto';

/**
 * One node of the BOM tree, nested — `children` holds this same node type, mirroring the tree-grid
 * this feeds. `code`/`name`/`unit` are flattened from whichever of `product`/`material` this node
 * links to (see `itemType`), matching the "Mã bản vẽ"/"Tên bản vẽ"/"ĐVT" columns 1:1.
 */
@Exclude()
export class BomItemResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @UUIDFieldOptional({ nullable: true, description: 'null for top-level items' })
  parentId!: string | null;

  @Expose()
  @EnumField(() => BomItemType)
  itemType!: BomItemType;

  @Expose()
  @UUIDField({ description: 'Id of the linked product/material' })
  itemId!: string;

  @Expose()
  @StringField({ description: 'Mã bản vẽ (linked product/material code)' })
  code!: string;

  @Expose()
  @StringField({ description: 'Tên bản vẽ (linked product/material name)' })
  name!: string;

  @Expose()
  @ClassField(() => BomItemUnitResDto)
  unit!: BomItemUnitResDto;

  @Expose()
  @StringField({ description: 'Số lượng (numeric, serialized as a string)' })
  quantity!: string;

  @Expose()
  @NumberField({ int: true, description: 'Deterministic sibling ordering' })
  sortOrder!: number;

  @Expose()
  @NumberField({ int: true, description: '1-based depth from the tree top, computed — not stored' })
  level!: number;

  @Expose()
  @StringFieldOptional({ nullable: true })
  note!: string | null;

  @Expose()
  @ClassFieldOptional(() => BomItemResDto, { each: true })
  children!: BomItemResDto[];
}
