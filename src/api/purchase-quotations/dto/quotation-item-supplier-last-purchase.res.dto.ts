import { Exclude, Expose } from 'class-transformer';

import { DateField, NumberField } from '../../../decorators/field.decorators';

@Exclude()
export class QuotationItemSupplierLastPurchaseResDto {
  @Expose()
  @NumberField({
    description: 'Đơn giá lần đặt mua gần nhất (đơn PO đã ORDERED)',
  })
  unitPrice!: number;

  @Expose()
  @DateField({ description: 'Ngày đặt mua gần nhất' })
  orderDate!: Date;
}
