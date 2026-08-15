import { PageOptionsDto } from '../../../common/dto/offset-pagination/page-options.dto';
import { IqcResult, OqcStatus } from '../../../database/schemas';
import {
  DateFieldOptional,
  EnumFieldOptional,
  StringFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

export class GetOqcsReqDto extends PageOptionsDto {
  @StringFieldOptional({ description: 'Tìm theo tên hoặc mã vật tư' })
  readonly materialKeyword?: string;

  @UUIDFieldOptional({ description: 'Filter theo Job (LSX)' })
  readonly productionJobId?: string;

  @UUIDFieldOptional({ description: 'Filter theo vật tư (thành phẩm)' })
  readonly itemId?: string;

  @EnumFieldOptional(() => IqcResult)
  readonly result?: IqcResult;

  @EnumFieldOptional(() => OqcStatus)
  readonly status?: OqcStatus;

  @DateFieldOptional({ description: 'Ngày kiểm từ' })
  readonly fromDate?: Date;

  @DateFieldOptional({ description: 'Ngày kiểm đến' })
  readonly toDate?: Date;
}
