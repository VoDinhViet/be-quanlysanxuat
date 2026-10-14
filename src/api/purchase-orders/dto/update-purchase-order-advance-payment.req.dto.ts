import {
  NumberField,
  StringFieldOptional,
} from '../../../decorators/field.decorators';

export class UpdatePurchaseOrderAdvancePaymentReqDto {
  @NumberField({
    min: 0,
    description: 'Tiền đã tạm ứng/thanh toán trước cho NCC (VNĐ), 0 = không có',
  })
  readonly advancePaymentAmount!: number;

  @StringFieldOptional({
    nullable: true,
    maxLength: 255,
    description: 'Diễn giải tạm ứng',
  })
  readonly advancePaymentNote?: string | null;
}
