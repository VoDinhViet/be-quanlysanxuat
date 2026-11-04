import {
  EnumFieldOptional,
  NumberFieldOptional,
} from '../../../decorators/field.decorators';
import { SUMMARY_MAX_DAYS } from '../../../common/summary/summary.constant';

export enum IqcInspectionRateGroupBy {
  DECISION = 'decision',
  DAY = 'day',
  SUPPLIER = 'supplier',
}

export class GetIqcInspectionRateReqDto {
  @EnumFieldOptional(() => IqcInspectionRateGroupBy, {
    description:
      'Cách nhóm số phiếu IQC đã xong: decision, day hoặc supplier; mặc định decision',
  })
  readonly groupBy?: IqcInspectionRateGroupBy;

  @NumberFieldOptional({
    int: true,
    min: 1,
    max: SUMMARY_MAX_DAYS,
    description: 'Chỉ phiếu IQC xong trong ngần ấy ngày gần đây',
  })
  readonly sinceDays?: number;
}
