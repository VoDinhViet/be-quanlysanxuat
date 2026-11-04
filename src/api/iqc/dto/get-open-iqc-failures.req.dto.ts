import { SUMMARY_MAX_DAYS } from '../../../common/summary/summary.constant';
import { LimitReqDto } from '../../../common/summary/summary.dto';
import { NumberFieldOptional } from '../../../decorators/field.decorators';

export class GetOpenIqcFailuresReqDto extends LimitReqDto {
  @NumberFieldOptional({
    int: true,
    min: 0,
    max: SUMMARY_MAX_DAYS,
    description: 'Chỉ phiếu tồn ít nhất ngần ấy ngày, mặc định 0',
  })
  readonly minAgeDays?: number;
}
