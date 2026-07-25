import { Exclude, Expose } from 'class-transformer';

import { FileResDto } from '../../files/dto/file.res.dto';
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
 * A single BOM node, without tree context (`level`/`children`) — what a single-item write
 * (add/update) returns. `BomItemResDto` extends this and adds the two tree-only fields for the
 * full-tree read. `code`/`name`/`unit`/`image` are flattened from whichever of `product`/`material`
 * this node links to (see `itemType`), matching the read side's coalesce.
 */
@Exclude()
export class BomItemNodeResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @UUIDFieldOptional({
    nullable: true,
    description: 'null for top-level items',
  })
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

  // Row is already coalesced to a flat `image` object (or all-null) by the SQL layer — not a
  // Drizzle relational `with:` result — so a plain ClassFieldOptional is correct here; `FileField`
  // is only needed to rename+map a relation key that differs from the property name.
  @Expose()
  @ClassFieldOptional(() => FileResDto, {
    nullable: true,
    description: 'Cột Hình',
  })
  image!: FileResDto | null;

  @Expose()
  @ClassField(() => BomItemUnitResDto)
  unit!: BomItemUnitResDto;

  @Expose()
  @NumberField({ description: 'Số lượng — số nguyên nếu node là WIP' })
  quantity!: number;

  @Expose()
  @NumberField({ int: true, description: 'Deterministic sibling ordering' })
  sortOrder!: number;

  @Expose()
  @StringFieldOptional({ nullable: true })
  note!: string | null;

  // Independent of `image` above (coalesced from the linked product/material) — this is a
  // technical drawing specific to this node itself.
  @Expose()
  @ClassFieldOptional(() => FileResDto, {
    nullable: true,
    description: 'Bản vẽ kỹ thuật riêng của node này',
  })
  drawing!: FileResDto | null;
}
