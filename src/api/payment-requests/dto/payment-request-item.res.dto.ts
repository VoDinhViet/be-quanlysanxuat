import { Exclude, Expose } from 'class-transformer';

import {
  NumberField,
  NumberFieldOptional,
  StringField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';

@Exclude()
export class PaymentRequestItemResDto {
  @Expose()
  @UUIDField({
    description: 'Id dòng đơn mua (purchase_order_items) tương ứng',
  })
  id!: string;

  @Expose()
  @StringField()
  directCode!: string;

  @Expose()
  @StringField()
  directName!: string;

  @Expose()
  @StringField()
  unit!: string;

  @Expose()
  @NumberField({ description: 'SL đặt của dòng PO' })
  orderedQty!: number;

  @Expose()
  @NumberField({ description: 'SL đã nhập kho (Σ phiếu nhập POSTED)' })
  receivedQty!: number;

  @Expose()
  @StringFieldOptional({
    nullable: true,
    description: 'Đơn vị báo giá của dòng (null = báo theo đơn vị chính)',
  })
  quotationUnit!: string | null;

  @Expose()
  @NumberFieldOptional({
    nullable: true,
    description: 'SL báo giá theo ĐVBG ghi trên PO',
  })
  orderedQuotationQty!: number | null;

  @Expose()
  @NumberFieldOptional({
    nullable: true,
    description:
      'SL ĐVBG thực nhập kho (đã trừ hàng trả NCC theo tỉ lệ); null khi dòng không có ĐVBG',
  })
  receivedQuotationQty!: number | null;

  @Expose()
  @NumberField()
  unitPrice!: number;

  @Expose()
  @NumberField({
    description:
      'Đơn giá × SL ĐVBG thực nhập nếu có ĐVBG, ngược lại đơn giá × SL đặt',
  })
  lineTotal!: number;
}
