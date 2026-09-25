import { Exclude, Expose } from 'class-transformer';

import { UnitStatus, UnitType } from '../../../database/schemas';
import {
  DateField,
  EnumField,
  StringField,
  UUIDField,
} from '../../../decorators/field.decorators';

@Exclude()
export class UnitResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField({ description: 'Unit code' })
  code!: string;

  @Expose()
  @StringField({ description: 'Unit name, e.g. Cái' })
  name!: string;

  @Expose()
  @EnumField(() => UnitType, {
    description: 'Nhóm đại lượng: số lượng, khối lượng, chiều dài, thể tích',
  })
  type!: UnitType;

  @Expose()
  @EnumField(() => UnitStatus)
  status!: UnitStatus;

  @Expose()
  @DateField()
  updatedAt!: Date;
}
