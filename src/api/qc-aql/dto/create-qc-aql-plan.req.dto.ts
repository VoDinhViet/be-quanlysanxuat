import { IqcInspectionLevel } from '../../../database/schemas';
import {
  ClassFieldOptional,
  EnumField,
  NumberField,
  StringField,
  StringFieldOptional,
} from '../../../decorators/field.decorators';
import { AQL_LEVELS } from '../../iqc/iqc-aql.constant';
import { QcAqlRuleReqDto } from './qc-aql-rule.req.dto';

export class CreateQcAqlPlanReqDto {
  @StringField({ maxLength: 50, description: 'Mã plan, ví dụ Z14-I-2.5' })
  readonly code!: string;

  @StringField({ maxLength: 255, description: 'Tên plan' })
  readonly name!: string;

  @StringField({ maxLength: 100, description: 'Tiêu chuẩn áp dụng' })
  readonly standard!: string;

  @EnumField(() => IqcInspectionLevel, { description: 'Mức kiểm tra' })
  readonly inspectionLevel!: IqcInspectionLevel;

  @NumberField({ isIn: AQL_LEVELS, description: 'Mức AQL (%)' })
  readonly aqlLevel!: number;

  @StringFieldOptional({ maxLength: 500, description: 'Ghi chú' })
  readonly note?: string;

  @ClassFieldOptional(() => QcAqlRuleReqDto, {
    each: true,
    description: 'Các dải lot size của plan này',
  })
  readonly rules?: QcAqlRuleReqDto[];
}
