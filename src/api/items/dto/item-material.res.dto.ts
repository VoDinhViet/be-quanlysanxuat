import { Exclude, Expose } from 'class-transformer';

import { FileResDto } from '../../files/dto/file.res.dto';
import { UnitResDto } from '../../units/dto/unit.res.dto';
import {
  ClassField,
  ClassFieldOptional,
  NumberField,
  StringField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';

/** Một dòng vật tư (RM) as-used trong cây BOM của một FG/WIP — nguồn là `bom_items` (node lá,
 * `item.type = RM`), không phải bảng riêng. */
@Exclude()
export class ItemMaterialResDto {
  @Expose()
  @UUIDField({ description: 'Id dòng bom_items' })
  id!: string;

  @Expose()
  @UUIDField({ description: 'Id của vật tư' })
  itemId!: string;

  @Expose()
  @StringField({ description: 'Mã vật tư' })
  code!: string;

  @Expose()
  @StringField({ description: 'Tên vật tư' })
  name!: string;

  @Expose()
  @ClassField(() => UnitResDto)
  unit!: UnitResDto;

  @Expose()
  @ClassFieldOptional(() => FileResDto, { nullable: true })
  image!: FileResDto | null;

  @Expose()
  @NumberField({ description: 'Định mức sử dụng' })
  quantity!: number;

  @Expose()
  @NumberField({ int: true, description: 'Deterministic sibling ordering' })
  sortOrder!: number;

  @Expose()
  @StringFieldOptional({ nullable: true })
  note!: string | null;
}
