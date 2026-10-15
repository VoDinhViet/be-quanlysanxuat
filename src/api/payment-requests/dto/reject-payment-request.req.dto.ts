import { StringField } from '../../../decorators/field.decorators';

export class RejectPaymentRequestReqDto {
  @StringField({
    maxLength: 1000,
    trim: true,
    description: 'Lý do từ chối thanh toán',
  })
  readonly reason!: string;
}
