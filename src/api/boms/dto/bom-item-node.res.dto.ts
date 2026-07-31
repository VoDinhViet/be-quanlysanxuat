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

  @Expose()
  @ClassFieldOptional(() => FileResDto, {
    nullable: true,
    description: 'Bản vẽ kỹ thuật riêng của node này',
  })
  drawing!: FileResDto | null;
}
