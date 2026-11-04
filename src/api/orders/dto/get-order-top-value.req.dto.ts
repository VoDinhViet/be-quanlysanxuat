import {
  BooleanFieldOptional,
  EnumFieldOptional,
} from '../../../decorators/field.decorators';
import { OrderStatus } from '../../../database/schemas';
import { OrderTotalRangeReqDto } from './order-total-range.req.dto';

export class GetOrderTopValueReqDto extends OrderTotalRangeReqDto {
  @EnumFieldOptional(() => OrderStatus, {
    description: 'Chỉ đơn ở trạng thái này',
  })
  readonly status?: OrderStatus;

  @BooleanFieldOptional({
    description: 'Bỏ đơn REJECTED; mặc định true, trừ khi đã lọc theo status',
  })
  readonly excludeRejected?: boolean;
}
