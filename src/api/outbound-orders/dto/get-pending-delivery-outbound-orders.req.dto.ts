import { NumberFieldOptional } from '../../../decorators/field.decorators';
import { LimitReqDto } from '../../../common/summary/summary.dto';
import {
  DEFAULT_PENDING_DELIVERY_DAYS_AHEAD,
  MAX_PENDING_DELIVERY_DAYS_AHEAD,
} from '../outbound-orders-summary.constant';

export class GetPendingDeliveryOutboundOrdersReqDto extends LimitReqDto {
  @NumberFieldOptional({
    int: true,
    min: 0,
    max: MAX_PENDING_DELIVERY_DAYS_AHEAD,
    description: `Số ngày tới tính từ hôm nay, gồm cả phiếu đã quá ngày giao; mặc định ${DEFAULT_PENDING_DELIVERY_DAYS_AHEAD}`,
  })
  readonly daysAhead?: number;
}
