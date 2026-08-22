import { Exclude, Expose } from 'class-transformer';

import { IqcInspectionLevel } from '../../../database/schemas';
import {
  BooleanField,
  DateField,
  EnumField,
  NumberField,
  StringField,
  UUIDField,
} from '../../../decorators/field.decorators';

@Exclude()
export class PageQcAqlPlanResDto {
  @Expose()
  @UUIDField({ description: 'Plan id' })
  readonly id!: string;

  @Expose()
  @StringField({ description: 'Mã plan' })
  readonly code!: string;

  @Expose()
  @StringField({ description: 'Tên plan' })
  readonly name!: string;

  @Expose()
  @StringField({ description: 'Tiêu chuẩn áp dụng' })
  readonly standard!: string;

  @Expose()
  @EnumField(() => IqcInspectionLevel, { description: 'Mức kiểm tra' })
  readonly inspectionLevel!: IqcInspectionLevel;

  @Expose()
  @NumberField({ description: 'Mức AQL (%)' })
  readonly aqlLevel!: number;

  @Expose()
  @BooleanField({ description: 'Còn dùng để tra AQL hay không' })
  readonly isActive!: boolean;

  @Expose()
  @DateField()
  readonly updatedAt!: Date;
}
