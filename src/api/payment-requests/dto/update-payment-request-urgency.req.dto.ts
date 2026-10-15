import { BooleanField } from '../../../decorators/field.decorators';

export class UpdatePaymentRequestUrgencyReqDto {
  @BooleanField({
    description: 'true = yêu cầu thanh toán gấp, false = bình thường',
  })
  readonly isUrgent!: boolean;
}
