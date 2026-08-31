import { Exclude, Expose } from 'class-transformer';

import { UnitRefResDto } from '../../units/dto/unit-ref.res.dto';
import {
  ClassField,
  DateField,
  NumberField,
  UUIDField,
} from '../../../decorators/field.decorators';

@Exclude()
export class ItemUnitResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @ClassField(() => UnitRefResDto)
  unit!: UnitRefResDto;

  @Expose()
  @NumberField({
    description: '1 đơn vị này = bao nhiêu đơn vị gốc của item',
  })
  conversionFactor!: number;

  @Expose()
  @DateField()
  createdAt!: Date;

  @Expose()
  @DateField()
  updatedAt!: Date;
}
