import { SUMMARY_MAX_DAYS } from '../../../common/summary/summary.constant';
import { LimitReqDto } from '../../../common/summary/summary.dto';
import { NumberFieldOptional } from '../../../decorators/field.decorators';

export class GetLateProductionJobOperationsReqDto extends LimitReqDto {
  @NumberFieldOptional({
    int: true,
    min: 1,
    max: SUMMARY_MAX_DAYS,
    description:
      'Chỉ công đoạn không có báo cáo tiến độ trong ngần ấy ngày (hoặc chưa từng báo cáo)',
  })
  readonly staleDays?: number;
}
