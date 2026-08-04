import { Exclude, Expose } from 'class-transformer';

import { FileResDto } from '../../files/dto/file.res.dto';
import {
  ClassField,
  ClassFieldOptional,
  NumberField,
  StringField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';
import { BomItemUnitResDto } from '../../boms/dto/bom-item-unit.res.dto';

@Exclude()
export class BomMaterialResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @UUIDField({ description: 'Id của vật tư' })
  materialId!: string;

  @Expose()
  @StringField({ description: 'Mã vật tư' })
  code!: string;

  @Expose()
  @StringField({ description: 'Tên vật tư' })
  name!: string;

  @Expose()
  @ClassField(() => BomItemUnitResDto)
  unit!: BomItemUnitResDto;

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
