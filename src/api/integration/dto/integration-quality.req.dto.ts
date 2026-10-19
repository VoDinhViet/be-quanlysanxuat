import {
  EnumField,
  EnumFieldOptional,
  NumberFieldOptional,
} from '../../../decorators/field.decorators';
import {
  INTEGRATION_MAX_DAYS,
  INTEGRATION_MAX_LIMIT,
  LimitReqDto,
} from './integration-common.dto';

export enum QualityRateGroupBy {
  DECISION = 'decision',
  DAY = 'day',
  SUPPLIER = 'supplier',
  TYPE = 'type',
}

export class QualityInspectionRateReqDto {
  @EnumFieldOptional(() => QualityRateGroupBy, {
    description: 'Mặc định decision',
  })
  readonly groupBy?: QualityRateGroupBy;

  @NumberFieldOptional({
    int: true,
    min: 1,
    max: INTEGRATION_MAX_DAYS,
    description: 'Chỉ phiếu kiểm xong trong ngần ấy ngày gần đây',
  })
  readonly sinceDays?: number;
}

export class IqcFailBySupplierReqDto {
  @NumberFieldOptional({
    int: true,
    min: 1,
    max: INTEGRATION_MAX_DAYS,
    description: 'Mặc định 90',
  })
  readonly sinceDays?: number;

  @NumberFieldOptional({
    int: true,
    min: 1,
    max: 100,
    description:
      'Bỏ nhà cung cấp có quá ít lần kiểm (tỉ lệ trên mẫu nhỏ gây hiểu nhầm), mặc định 3',
  })
  readonly minInspections?: number;

  @NumberFieldOptional({
    int: true,
    min: 1,
    max: INTEGRATION_MAX_LIMIT,
    description: 'Mặc định 10',
  })
  readonly limit?: number;
}

export class OpenNcrReqDto extends LimitReqDto {
  @NumberFieldOptional({
    int: true,
    min: 0,
    max: INTEGRATION_MAX_DAYS,
    description: 'Chỉ phiếu tồn ít nhất ngần ấy ngày, mặc định 0',
  })
  readonly minAgeDays?: number;
}

export enum QualitySummaryGroupBy {
  DECISION = 'decision',
  DAY = 'day',
  SUPPLIER = 'supplier',
  TYPE = 'type',
  SUPPLIER_FAIL_RATE = 'supplier_fail_rate',
}

export enum QualityWatchKind {
  OPEN_NCR = 'open_ncr',
}

export class QualitySummaryReqDto {
  @EnumField(() => QualitySummaryGroupBy, {
    description:
      'decision/day/supplier/type: số phiếu kiểm đã xong theo kết quả; supplier_fail_rate: tỉ lệ kiểm đầu vào không đạt theo nhà cung cấp',
  })
  readonly groupBy!: QualitySummaryGroupBy;

  @NumberFieldOptional({
    int: true,
    min: 1,
    max: INTEGRATION_MAX_DAYS,
    description:
      'Chỉ phiếu kiểm xong trong ngần ấy ngày gần đây; supplier_fail_rate mặc định 90',
  })
  readonly sinceDays?: number;

  @NumberFieldOptional({
    int: true,
    min: 1,
    max: 100,
    description:
      'supplier_fail_rate: bỏ nhà cung cấp có quá ít lần kiểm (tỉ lệ trên mẫu nhỏ gây hiểu nhầm), mặc định 3',
  })
  readonly minInspections?: number;

  @NumberFieldOptional({
    int: true,
    min: 1,
    max: INTEGRATION_MAX_LIMIT,
    description: 'supplier_fail_rate: số nhà cung cấp tối đa, mặc định 10',
  })
  readonly limit?: number;
}

export class QualityWatchlistReqDto extends LimitReqDto {
  @EnumField(() => QualityWatchKind, {
    description:
      'open_ncr: phiếu kiểm không đạt còn mở (chưa xong, hoặc xong nhưng chưa có cách xử lý)',
  })
  readonly kind!: QualityWatchKind;

  @NumberFieldOptional({
    int: true,
    min: 0,
    max: INTEGRATION_MAX_DAYS,
    description: 'open_ncr: chỉ phiếu tồn ít nhất ngần ấy ngày, mặc định 0',
  })
  readonly minAgeDays?: number;
}
