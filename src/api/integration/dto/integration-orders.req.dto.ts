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
  DateRangeLimitReqDto,
  DateRangeReqDto,
  DOCUMENT_CODE_PATTERN,
  INTEGRATION_MAX_LIMIT,
  LimitReqDto,
  STATUS_CODE_PATTERN,
  STATUS_FIELD_OPTIONS,
  SummaryMetric,
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
  SALESPERSON = 'salesperson',
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
    description: 'Số dòng khi groupBy=client hoặc salesperson, mặc định 10',
  })
  readonly limit?: number;
}

export class TopOrdersReqDto extends DateRangeReqDto {
  @StringFieldOptional({
    ...STATUS_FIELD,
    description: 'Chỉ đơn ở trạng thái này',
  })
  readonly status?: string;

  @NumberFieldOptional({
    min: 0,
    description: 'Chỉ đơn có tổng giá trị từ mức này trở lên',
  })
  readonly minTotal?: number;

  @NumberFieldOptional({
    int: true,
    min: 1,
    max: INTEGRATION_MAX_LIMIT,
    description: 'Mặc định 10',
  })
  readonly limit?: number;

  @BooleanFieldOptional({ description: 'Bỏ đơn REJECTED, mặc định true' })
  readonly excludeRejected?: boolean;
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

export enum OrdersGroupBy {
  MONTH = 'month',
  CLIENT = 'client',
  STATUS = 'status',
  SALESPERSON = 'salesperson',
  ORDER = 'order',
  CLIENT_STATUS = 'client_status',
}

export enum OrdersWatchKind {
  OVERDUE_ORDERS = 'overdue_orders',
  PENDING_DELIVERIES = 'pending_deliveries',
}

export class OrdersSummaryReqDto extends DateRangeLimitReqDto {
  @EnumField(() => OrdersGroupBy, {
    description:
      'month/client/status/salesperson gom giá trị hoặc số đơn; order liệt kê từng đơn lớn nhất; client_status đếm khách hàng theo trạng thái',
  })
  readonly groupBy!: OrdersGroupBy;

  @EnumFieldOptional(() => SummaryMetric, {
    description: 'Mặc định total; bỏ qua khi groupBy=order hoặc client_status',
  })
  readonly metric?: SummaryMetric;

  @StringFieldOptional({
    ...STATUS_FIELD_OPTIONS,
    description: 'Chỉ đơn (hoặc khách hàng khi client_status) ở trạng thái này',
  })
  readonly status?: string;

  @BooleanFieldOptional({
    description: 'Bỏ đơn REJECTED; mặc định true, trừ khi groupBy=status',
  })
  readonly excludeRejected?: boolean;

  @NumberFieldOptional({
    min: 0,
    description:
      'Từ mức này trở lên (>=): groupBy=order lọc từng đơn, groupBy=client lọc tổng giá trị đơn của khách',
  })
  readonly minTotal?: number;

  @NumberFieldOptional({
    min: 0,
    description:
      'Dưới mức này (<): groupBy=order lọc từng đơn, groupBy=client lọc tổng giá trị đơn của khách',
  })
  readonly maxTotal?: number;
}

export class OrdersWatchlistReqDto extends LimitReqDto {
  @EnumField(() => OrdersWatchKind, {
    description:
      'overdue_orders: đơn bán quá hạn giao; pending_deliveries: phiếu xuất chờ giao',
  })
  readonly kind!: OrdersWatchKind;

  @NumberFieldOptional({
    int: true,
    min: 0,
    max: 30,
    description:
      'overdue_orders: 0 là đã trễ hạn; N > 0 gồm cả đơn đến hạn trong N ngày tới',
  })
  readonly dueWithinDays?: number;

  @ToArrayFromCsv()
  @ArrayMaxSize(8)
  @StringFieldOptional({
    ...STATUS_FIELD_OPTIONS,
    each: true,
    description:
      'overdue_orders: trạng thái coi là chưa xong, mặc định IN_PROGRESS và AWAITING_PRODUCTION',
  })
  readonly statuses?: string[];

  @BooleanFieldOptional({
    description: 'overdue_orders: thêm cột khách hàng, mặc định false',
  })
  readonly withClient?: boolean;

  @NumberFieldOptional({
    int: true,
    min: 0,
    max: 60,
    description:
      'pending_deliveries: gồm cả phiếu đã quá ngày giao, mặc định 7',
  })
  readonly daysAhead?: number;
}
