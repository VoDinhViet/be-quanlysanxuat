import { StringField } from '../../../decorators/field.decorators';

export class RejectOutsourcingOrderReqDto {
  @StringField({
    maxLength: 1000,
    trim: true,
    description: 'Lý do từ chối phiếu gia công ngoài',
  })
  readonly reason!: string;
}
