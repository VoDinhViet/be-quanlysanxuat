import {
  DateField,
  NumberField,
  StringFieldOptional,
} from '../../../decorators/field.decorators';

export class CreateOrderPaymentReqDto {
  @NumberField({
    description:
      'Số tiền — âm nếu là bút toán đảo (huỷ một lần ghi nhận trước đó)',
  })
  readonly amount!: number;

  @DateField({ description: 'Ngày thực nhận tiền' })
  readonly paidAt!: Date;

  @StringFieldOptional({ nullable: true, maxLength: 500 })
  readonly note?: string | null;
}
