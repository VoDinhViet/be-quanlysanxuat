import {
  BooleanFieldOptional,
  EnumFieldOptional,
  StringFieldOptional,
} from '../../../decorators/field.decorators';
import { LimitReqDto, STATUS_CODE_PATTERN } from './integration-common.dto';

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
