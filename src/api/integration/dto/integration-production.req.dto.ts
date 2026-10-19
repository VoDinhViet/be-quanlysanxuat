import {
  EnumField,
  NumberFieldOptional,
  StringFieldOptional,
} from '../../../decorators/field.decorators';
import {
  DateRangeReqDto,
  INTEGRATION_MAX_DAYS,
  LimitReqDto,
  STATUS_CODE_PATTERN,
  STATUS_FIELD_OPTIONS,
} from './integration-common.dto';

const STATUS_FIELD = {
  pattern: STATUS_CODE_PATTERN,
  patternMessage: 'Mã trạng thái là chữ hoa và gạch dưới',
  maxLength: 41,
};

export class ProductionJobsByItemReqDto {
  @StringFieldOptional({ ...STATUS_FIELD, description: 'Mặc định COMPLETED' })
  readonly status?: string;
}

export class LateJobOperationsReqDto extends LimitReqDto {
  @NumberFieldOptional({
    int: true,
    min: 1,
    max: INTEGRATION_MAX_DAYS,
    description:
      'Chỉ công đoạn không có báo cáo tiến độ trong ngần ấy ngày (hoặc chưa từng báo cáo)',
  })
  readonly staleDays?: number;
}

export class OperationsByTypeReqDto {
  @StringFieldOptional({
    ...STATUS_FIELD,
    description:
      'Loại công đoạn, ví dụ OUTSOURCE là gia công ngoài; bỏ trống thì gộp theo loại',
  })
  readonly type?: string;
}

export enum ProductionSummaryEntity {
  JOBS = 'jobs',
  PRODUCTION_ORDERS = 'production_orders',
  OPERATIONS = 'operations',
  OUTSOURCING_ORDERS = 'outsourcing_orders',
}

export enum ProductionSummaryGroupBy {
  STATUS = 'status',
  ITEM = 'item',
  TYPE = 'type',
  SUPPLIER = 'supplier',
}

export enum ProductionWatchKind {
  LATE_OPERATIONS = 'late_operations',
  OPEN_PRODUCTION_ORDERS = 'open_production_orders',
  OVERDUE_OUTSOURCING = 'overdue_outsourcing',
}

export class ProductionSummaryReqDto extends DateRangeReqDto {
  @EnumField(() => ProductionSummaryEntity, {
    description:
      'jobs: job sản xuất; production_orders: lệnh sản xuất; operations: công đoạn; outsourcing_orders: phiếu gửi gia công ngoài',
  })
  readonly entity!: ProductionSummaryEntity;

  @EnumField(() => ProductionSummaryGroupBy, {
    description:
      'Chỉ nhận jobs+status, jobs+item, production_orders+status, operations+type, outsourcing_orders+status, outsourcing_orders+supplier',
  })
  readonly groupBy!: ProductionSummaryGroupBy;

  @StringFieldOptional({
    ...STATUS_FIELD_OPTIONS,
    description:
      'jobs+item: chỉ job ở trạng thái này, mặc định COMPLETED; outsourcing_orders+supplier: chỉ phiếu ở trạng thái này',
  })
  readonly status?: string;

  @StringFieldOptional({
    ...STATUS_FIELD_OPTIONS,
    description:
      'operations+type: chỉ loại công đoạn này, ví dụ OUTSOURCE là gia công ngoài',
  })
  readonly type?: string;
}

export class ProductionWatchlistReqDto extends LimitReqDto {
  @EnumField(() => ProductionWatchKind, {
    description:
      'late_operations: công đoạn quá hạn chưa xong; open_production_orders: lệnh sản xuất chưa hoàn thành; overdue_outsourcing: phiếu gia công ngoài quá hạn nhận về',
  })
  readonly kind!: ProductionWatchKind;

  @NumberFieldOptional({
    int: true,
    min: 1,
    max: INTEGRATION_MAX_DAYS,
    description:
      'late_operations: chỉ công đoạn không có báo cáo tiến độ trong ngần ấy ngày (hoặc chưa từng báo cáo)',
  })
  readonly staleDays?: number;
}
