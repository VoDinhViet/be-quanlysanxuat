import {
  BooleanFieldOptional,
  EnumField,
  EnumFieldOptional,
  StringFieldOptional,
} from '../../../decorators/field.decorators';
import {
  DateRangeReqDto,
  LimitReqDto,
  STATUS_CODE_PATTERN,
  STATUS_FIELD_OPTIONS,
} from './integration-common.dto';

export enum InventoryRankingOrder {
  HIGHEST = 'highest',
  LOWEST = 'lowest',
}

const STATUS_FIELD = {
  pattern: STATUS_CODE_PATTERN,
  patternMessage: 'Mã trạng thái là chữ hoa và gạch dưới',
  maxLength: 41,
};

export class InventoryRankingReqDto extends LimitReqDto {
  @EnumFieldOptional(() => InventoryRankingOrder, {
    description: 'Mặc định highest',
  })
  readonly order?: InventoryRankingOrder;

  @BooleanFieldOptional({ description: 'Chỉ vật tư còn hàng, mặc định false' })
  readonly inStockOnly?: boolean;

  @BooleanFieldOptional({
    description:
      'Chỉ vật tư có tồn tối thiểu và đang tồn dưới mức đó (kể cả hết hàng)',
  })
  readonly belowMinStock?: boolean;
}

export class PurchaseValueBySupplierReqDto {
  @StringFieldOptional({ ...STATUS_FIELD, description: 'Mặc định ORDERED' })
  readonly status?: string;

  @BooleanFieldOptional({ description: 'Thêm số đơn mua, mặc định false' })
  readonly withOrderCount?: boolean;
}

export class PaymentRequestValueReqDto {
  @StringFieldOptional({
    ...STATUS_FIELD,
    description: 'Bỏ trống thì gộp theo trạng thái',
  })
  readonly status?: string;
}

export enum PurchasingSummaryEntity {
  PURCHASE_ORDERS = 'purchase_orders',
  PAYMENT_REQUESTS = 'payment_requests',
  QUOTATIONS = 'quotations',
  SUPPLIER_RETURNS = 'supplier_returns',
}

export enum PurchasingSummaryGroupBy {
  SUPPLIER = 'supplier',
  STATUS = 'status',
}

export enum PurchasingWatchKind {
  OVERDUE_PURCHASE_ORDERS = 'overdue_purchase_orders',
  STUCK_REQUESTS = 'stuck_requests',
  OVERDUE_PAYMENTS = 'overdue_payments',
}

export class PurchasingSummaryReqDto extends DateRangeReqDto {
  @EnumField(() => PurchasingSummaryEntity, {
    description:
      'purchase_orders: đơn mua; payment_requests: đề nghị thanh toán; quotations: báo giá (RFQ); supplier_returns: phiếu trả nhà cung cấp',
  })
  readonly entity!: PurchasingSummaryEntity;

  @EnumField(() => PurchasingSummaryGroupBy, {
    description:
      'Chỉ nhận purchase_orders+supplier, payment_requests+status, quotations+status, supplier_returns+status, supplier_returns+supplier',
  })
  readonly groupBy!: PurchasingSummaryGroupBy;

  @StringFieldOptional({
    ...STATUS_FIELD_OPTIONS,
    description:
      'purchase_orders+supplier: mặc định ORDERED; các nhóm còn lại: chỉ chứng từ ở trạng thái này',
  })
  readonly status?: string;

  @BooleanFieldOptional({
    description: 'purchase_orders+supplier: thêm số đơn mua, mặc định false',
  })
  readonly withOrderCount?: boolean;
}

export class PurchasingWatchlistReqDto extends LimitReqDto {
  @EnumField(() => PurchasingWatchKind, {
    description:
      'overdue_purchase_orders: đơn mua quá ngày dự kiến chưa nhận đủ; stuck_requests: đề nghị mua đã duyệt còn dòng chưa lên đơn; overdue_payments: đề nghị thanh toán chờ đã quá hạn',
  })
  readonly kind!: PurchasingWatchKind;
}
