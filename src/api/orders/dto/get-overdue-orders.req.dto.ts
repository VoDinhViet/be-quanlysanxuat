import {
  EnumFieldOptional,
  NumberFieldOptional,
} from '../../../decorators/field.decorators';
import { ToArrayFromCsv } from '../../../decorators/transform.decorators';
import { OrderStatus } from '../../../database/schemas';
import { LimitReqDto } from '../../../common/summary/summary.dto';
import { MAX_DUE_WITHIN_DAYS } from '../orders-summary.constant';

export class GetOverdueOrdersReqDto extends LimitReqDto {
  @ToArrayFromCsv()
  @EnumFieldOptional(() => OrderStatus, {
    each: true,
    description:
      'Trạng thái coi là chưa xong, mặc định IN_PROGRESS và AWAITING_PRODUCTION',
  })
  readonly statuses?: OrderStatus[];

  @NumberFieldOptional({
    int: true,
    min: 0,
    max: MAX_DUE_WITHIN_DAYS,
    description:
      '0 là đã trễ hạn; N > 0 gồm cả đơn đến hạn trong N ngày tới. Mặc định 0',
  })
  readonly dueWithinDays?: number;
}
