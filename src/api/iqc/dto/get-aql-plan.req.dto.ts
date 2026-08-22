import { IqcInspectionLevel } from '../../../database/schemas';
import { EnumField, NumberField } from '../../../decorators/field.decorators';
import { AQL_LEVELS } from '../iqc-aql.constant';

export class GetAqlPlanReqDto {
  @NumberField({
    isPositive: true,
    description: 'Lot size (SL sản xuất thực tế)',
  })
  readonly quantity!: number;

  @EnumField(() => IqcInspectionLevel, {
    description: 'Mức kiểm tra (Inspection Level)',
  })
  readonly inspectionLevel!: IqcInspectionLevel;

  @NumberField({
    description: `Mức AQL (%) — một trong ${AQL_LEVELS.join('/')}`,
  })
  readonly aqlLevel!: number;
}
