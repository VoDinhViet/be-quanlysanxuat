import {
  NumberFieldOptional,
  StringFieldOptional,
} from '../../../decorators/field.decorators';

export class UpdatePaymentRequestExtraCostReqDto {
  @NumberFieldOptional({
    min: 0,
    description:
      'Số tiền phát sinh sau khi đặt hàng (VND); bỏ trống coi như 0 (xoá chi phí phát sinh)',
  })
  readonly extraCost?: number;

  @StringFieldOptional({
    nullable: true,
    maxLength: 1000,
    description: 'Diễn giải / lý do chi phí phát sinh sau đặt hàng',
  })
  readonly extraCostNote?: string | null;
}
