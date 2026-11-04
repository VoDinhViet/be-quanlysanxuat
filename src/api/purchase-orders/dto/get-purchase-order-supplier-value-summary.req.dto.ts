import { DateRangeLimitReqDto } from '../../../common/summary/summary.dto';
import { PurchaseOrderStatus } from '../../../database/schemas';
import { EnumFieldOptional } from '../../../decorators/field.decorators';

export class GetPurchaseOrderSupplierValueSummaryReqDto extends DateRangeLimitReqDto {
  @EnumFieldOptional(() => PurchaseOrderStatus, {
    description: 'Trạng thái đơn mua cần cộng giá trị, mặc định ORDERED',
  })
  readonly status?: PurchaseOrderStatus;
}
