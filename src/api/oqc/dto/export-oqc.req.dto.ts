import {
  IqcResult,
  OqcDisposition,
  QualityInspectionStatus,
} from '../../../database/schemas';
import {
  DateFieldOptional,
  EnumFieldOptional,
  StringFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

export class ExportOqcReqDto {
  @StringFieldOptional()
  readonly q?: string;

  @UUIDFieldOptional({ description: 'Filter theo Job (LSX)' })
  readonly productionJobId?: string;

  @UUIDFieldOptional({ description: 'Filter theo công đoạn' })
  readonly productionJobOperationId?: string;

  @UUIDFieldOptional({ description: 'Filter theo vật tư (thành phẩm)' })
  readonly itemId?: string;

  @EnumFieldOptional(() => IqcResult)
  readonly result?: IqcResult;

  @EnumFieldOptional(() => QualityInspectionStatus)
  readonly status?: QualityInspectionStatus;

  @EnumFieldOptional(() => OqcDisposition)
  readonly disposition?: OqcDisposition;

  @DateFieldOptional({ description: 'Filter: inspectionDate >= startDate' })
  readonly startDate?: Date;

  @DateFieldOptional({ description: 'Filter: inspectionDate <= endDate' })
  readonly endDate?: Date;
}
