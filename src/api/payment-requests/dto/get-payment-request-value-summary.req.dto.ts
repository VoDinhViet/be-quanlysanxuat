import { DateRangeReqDto } from '../../../common/summary/summary.dto';
import { PaymentRequestStatus } from '../../../database/schemas';
import { EnumFieldOptional } from '../../../decorators/field.decorators';

export class GetPaymentRequestValueSummaryReqDto extends DateRangeReqDto {
  @EnumFieldOptional(() => PaymentRequestStatus, {
    description:
      'Chỉ tính yêu cầu ở trạng thái này, bỏ trống thì trả mọi trạng thái',
  })
  readonly status?: PaymentRequestStatus;
}
