import { StringField } from '../../../decorators/field.decorators';

export class UpdateOrderBuyerPoReqDto {
  @StringField({
    maxLength: 100,
    trim: true,
    description:
      'Số PO của khách hàng — khác mã đơn nội bộ do hệ thống sinh; ghi đè số PO hiện có',
  })
  readonly buyerPoNo!: string;
}
