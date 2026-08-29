import {
  IqcDisposition,
  IqcResult,
  QualityInspectionStatus,
} from '../../../database/schemas';
import { PageOptionsDto } from '../../../common/dto/offset-pagination/page-options.dto';
import {
  EnumFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

export class GetIqcsReqDto extends PageOptionsDto {
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
