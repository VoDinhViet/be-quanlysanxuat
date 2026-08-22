import { Exclude, Expose } from 'class-transformer';

import { IqcInspectionLevel } from '../../../database/schemas';
import {
  BooleanField,
  ClassField,
  DateField,
  EnumField,
  NumberField,
  StringField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';
import { QcAqlRuleResDto } from './qc-aql-rule.res.dto';

@Exclude()
export class QcAqlPlanResDto {
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
  @StringFieldOptional({ nullable: true, description: 'Ghi chú' })
  readonly note?: string | null;

  @Expose()
  @ClassField(() => QcAqlRuleResDto, {
    each: true,
    description: 'Các dải lot size của plan này',
  })
  readonly rules!: QcAqlRuleResDto[];

  @Expose()
  @DateField()
  readonly createdAt!: Date;

  @Expose()
  @DateField()
  readonly updatedAt!: Date;
}
