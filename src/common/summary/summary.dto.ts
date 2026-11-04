import {
  NumberFieldOptional,
  StringFieldOptional,
} from '../../decorators/field.decorators';
import {
  ISO_DATE_PATTERN,
  SUMMARY_DEFAULT_LIMIT,
  SUMMARY_MAX_LIMIT,
} from './summary.constant';

export enum SummaryMetric {
  TOTAL = 'total',
  COUNT = 'count',
}

/** Tham số `limit` dùng chung; route có mặc định riêng truyền `defaultLimit` để mô tả khớp với `limitOf`. */
export function LimitField(
  defaultLimit: number = SUMMARY_DEFAULT_LIMIT,
): PropertyDecorator {
  return NumberFieldOptional({
    int: true,
    min: 1,
    max: SUMMARY_MAX_LIMIT,
    description: `Số dòng tối đa (1-${SUMMARY_MAX_LIMIT}), mặc định ${defaultLimit}`,
  });
}

export function limitOf(
  reqDto: { limit?: number },
  defaultLimit: number = SUMMARY_DEFAULT_LIMIT,
): number {
  return reqDto.limit ?? defaultLimit;
}

export class DateRangeReqDto {
  @StringFieldOptional({
    description: 'Từ ngày (YYYY-MM-DD), gồm cả ngày này',
    pattern: ISO_DATE_PATTERN,
    patternMessage: 'startDate phải có dạng YYYY-MM-DD',
  })
  readonly startDate?: string;

  @StringFieldOptional({
    description: 'Đến ngày (YYYY-MM-DD), gồm cả ngày này',
    pattern: ISO_DATE_PATTERN,
    patternMessage: 'endDate phải có dạng YYYY-MM-DD',
  })
  readonly endDate?: string;
}

export class LimitReqDto {
  @LimitField()
  readonly limit?: number;
}

export class DateRangeLimitReqDto extends DateRangeReqDto {
  @LimitField()
  readonly limit?: number;
}
