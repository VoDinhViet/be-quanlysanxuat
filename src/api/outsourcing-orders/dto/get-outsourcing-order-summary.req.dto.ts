import { DateRangeLimitReqDto } from '../../../common/summary/summary.dto';
import { OutsourcingOrderStatus } from '../../../database/schemas';
import { EnumFieldOptional } from '../../../decorators/field.decorators';

export enum OutsourcingOrderSummaryGroupBy {
  STATUS = 'status',
  SUPPLIER = 'supplier',
}

export class GetOutsourcingOrderSummaryReqDto extends DateRangeLimitReqDto {
  @EnumFieldOptional(() => OutsourcingOrderSummaryGroupBy, {
    description: 'Gom theo trạng thái hoặc nhà cung cấp, mặc định status',
  })
  readonly groupBy?: OutsourcingOrderSummaryGroupBy;

  @EnumFieldOptional(() => OutsourcingOrderStatus, {
    description: 'Chỉ phiếu ở trạng thái này',
  })
  readonly status?: OutsourcingOrderStatus;
}
