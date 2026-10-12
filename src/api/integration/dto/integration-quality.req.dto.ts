import {
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
