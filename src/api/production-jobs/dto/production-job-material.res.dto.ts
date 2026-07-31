import { Exclude, Expose } from 'class-transformer';

import { BomItemUnitResDto } from '../../boms/dto/bom-item-unit.res.dto';
import { FileResDto } from '../../files/dto/file.res.dto';
import {
  ClassField,
  ClassFieldOptional,
  NumberField,
  NumberFieldOptional,
  StringField,
  UUIDField,
} from '../../../decorators/field.decorators';

@Exclude()
export class ProductionJobMaterialResDto {
  @Expose()
  @UUIDField()
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
  @NumberFieldOptional({
    nullable: true,
    description: 'Định mức BOM lúc duyệt LSX, bất biến',
  })
  unitQty!: number | null;

  @Expose()
  @NumberField({ description: 'Nhu cầu thật của Job = định mức × SL Job' })
  requiredQty!: number;
}
