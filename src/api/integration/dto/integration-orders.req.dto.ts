import { ArrayMaxSize } from 'class-validator';

import {
  BooleanFieldOptional,
  EnumField,
  EnumFieldOptional,
  NumberFieldOptional,
  StringFieldOptional,
} from '../../../decorators/field.decorators';
import { ToArrayFromCsv } from '../../../decorators/transform.decorators';
import {
  DateRangeReqDto,
  DOCUMENT_CODE_PATTERN,
  INTEGRATION_MAX_LIMIT,
  LimitReqDto,
  STATUS_CODE_PATTERN,
} from './integration-common.dto';

export enum StatusCountEntity {
  ORDERS = 'orders',
  PRODUCTION_JOBS = 'production_jobs',
  PRODUCTION_ORDERS = 'production_orders',
  PAYMENT_REQUESTS = 'payment_requests',
  INVENTORY_RECEIPTS = 'inventory_receipts',
}

export enum OrderValueGroupBy {
  MONTH = 'month',
  CLIENT = 'client',
  STATUS = 'status',
}

export enum OrderValueMetric {
  TOTAL = 'total',
  COUNT = 'count',
}

const STATUS_FIELD = {
  pattern: STATUS_CODE_PATTERN,
  patternMessage: 'Mã trạng thái là chữ hoa và gạch dưới',
  maxLength: 41,
};

export class CountByStatusReqDto extends DateRangeReqDto {
  @EnumField(() => StatusCountEntity, {
    description:
      'Thực thể cần đếm; inventory_receipts đếm thêm theo loại phiếu nhập',
  })
  readonly entity!: StatusCountEntity;
}

export class OrderValueReqDto extends DateRangeReqDto {
  @EnumFieldOptional(() => OrderValueGroupBy, { description: 'Mặc định month' })
  readonly groupBy?: OrderValueGroupBy;

  @EnumFieldOptional(() => OrderValueMetric, { description: 'Mặc định total' })
  readonly metric?: OrderValueMetric;

  @StringFieldOptional({
    ...STATUS_FIELD,
    description: 'Chỉ đơn ở trạng thái này',
  })
  readonly status?: string;

  @BooleanFieldOptional({ description: 'Bỏ đơn REJECTED, mặc định true' })
  readonly excludeRejected?: boolean;

  @NumberFieldOptional({
    int: true,
    min: 1,
    max: INTEGRATION_MAX_LIMIT,
    description: 'Số dòng khi groupBy=client, mặc định 10',
  })
  readonly limit?: number;
}

export class TopClientsReqDto extends DateRangeReqDto {
  @NumberFieldOptional({
    int: true,
    min: 1,
    max: INTEGRATION_MAX_LIMIT,
    description: 'Mặc định 5',
  })
  readonly limit?: number;

  @BooleanFieldOptional({ description: 'Bỏ đơn REJECTED, mặc định true' })
  readonly excludeRejected?: boolean;
}

export class OverdueOrdersReqDto {
  @ToArrayFromCsv()
  @ArrayMaxSize(8)
  @StringFieldOptional({
    ...STATUS_FIELD,
    each: true,
    description:
      'Trạng thái coi là chưa xong, mặc định IN_PROGRESS và AWAITING_PRODUCTION',
  })
  readonly statuses?: string[];

  @BooleanFieldOptional({ description: 'Thêm cột khách hàng, mặc định false' })
  readonly withClient?: boolean;

  @NumberFieldOptional({
    int: true,
    min: 0,
    max: 30,
    description: '0 là đã trễ hạn; N > 0 gồm cả đơn đến hạn trong N ngày tới',
  })
  readonly dueWithinDays?: number;
}

export class PendingDeliveriesReqDto extends LimitReqDto {
  @NumberFieldOptional({
    int: true,
    min: 0,
    max: 60,
    description: 'Gồm cả phiếu đã quá ngày giao, mặc định 7',
  })
  readonly daysAhead?: number;
}

export class OrderProgressReqDto extends LimitReqDto {
  @StringFieldOptional({
    pattern: DOCUMENT_CODE_PATTERN,
    patternMessage: 'Mã đơn chỉ gồm chữ, số, . _ / -',
    maxLength: 40,
    description: 'Có mã đơn thì chỉ đơn đó',
  })
  readonly orderCode?: string;

  @StringFieldOptional({
    ...STATUS_FIELD,
    description: 'Mặc định AWAITING_PRODUCTION và IN_PROGRESS',
  })
  readonly status?: string;
}

export class CountClientsReqDto {
  @StringFieldOptional({
    ...STATUS_FIELD,
    description: 'Bỏ trống thì gộp theo trạng thái; ACTIVE là đang hoạt động',
  })
  readonly status?: string;
}
