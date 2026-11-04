import { SUMMARY_MAX_DAYS } from '../../../common/summary/summary.constant';
import { LimitReqDto } from '../../../common/summary/summary.dto';
import { NumberFieldOptional } from '../../../decorators/field.decorators';
import {
  DEFAULT_FAIL_RATE_SINCE_DAYS,
  DEFAULT_MIN_INSPECTIONS,
  MAX_MIN_INSPECTIONS,
} from '../iqc-summary.constant';

export class GetIqcSupplierFailRateReqDto extends LimitReqDto {
  @NumberFieldOptional({
    int: true,
    min: 1,
    max: SUMMARY_MAX_DAYS,
    description: `Chỉ phiếu kiểm xong trong ngần ấy ngày gần đây, mặc định ${DEFAULT_FAIL_RATE_SINCE_DAYS}`,
  })
  readonly sinceDays?: number;

  @NumberFieldOptional({
    int: true,
    min: 1,
    max: MAX_MIN_INSPECTIONS,
    description: `Bỏ nhà cung cấp có quá ít lần kiểm, mặc định ${DEFAULT_MIN_INSPECTIONS}`,
  })
  readonly minInspections?: number;
}
