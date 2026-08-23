import { PageOptionsDto } from '../../../common/dto/offset-pagination/page-options.dto';
import {
  IqcResult,
  OqcDisposition,
  OqcStatus,
} from '../../../database/schemas';
import {
  DateFieldOptional,
  EnumFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

export class GetOqcsReqDto extends PageOptionsDto {
  @UUIDFieldOptional({ description: 'Filter theo Job (LSX)' })
  readonly productionJobId?: string;

  @UUIDFieldOptional({ description: 'Filter theo công đoạn' })
  readonly productionJobOperationId?: string;

  @UUIDFieldOptional({ description: 'Filter theo vật tư (thành phẩm)' })
  readonly itemId?: string;

  @EnumFieldOptional(() => IqcResult)
  readonly result?: IqcResult;

  @EnumFieldOptional(() => OqcStatus)
  readonly status?: OqcStatus;

  @EnumFieldOptional(() => OqcDisposition)
  readonly disposition?: OqcDisposition;

  @DateFieldOptional({ description: 'Filter: inspectionDate >= startDate' })
  readonly startDate?: Date;

  @DateFieldOptional({ description: 'Filter: inspectionDate <= endDate' })
  readonly endDate?: Date;
}
