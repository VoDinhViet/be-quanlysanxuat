import {
  IqcDisposition,
  IqcResult,
  QualityInspectionStatus,
} from '../../../database/schemas';
import {
  EnumFieldOptional,
  StringFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

export class ExportIqcReqDto {
  @StringFieldOptional()
  readonly q?: string;

  @UUIDFieldOptional({ description: 'Filter theo NCC' })
  readonly supplierId?: string;

  @UUIDFieldOptional({ description: 'Filter theo khách hàng gửi trả' })
  readonly clientId?: string;

  @EnumFieldOptional(() => IqcResult)
  readonly result?: IqcResult;

  @EnumFieldOptional(() => IqcDisposition)
  readonly disposition?: IqcDisposition;

  @EnumFieldOptional(() => QualityInspectionStatus)
  readonly status?: QualityInspectionStatus;
}
