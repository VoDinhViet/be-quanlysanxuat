import { Exclude, Expose } from 'class-transformer';

import {
  ClassField,
  DateField,
  NumberField,
  UUIDField,
} from '../../../decorators/field.decorators';
import { SupplierRefResDto } from '../../suppliers/dto/supplier-ref.res.dto';

@Exclude()
export class QuotationLastPurchaseResDto {
  @Expose()
  @UUIDField()
  itemId!: string;

  @Expose()
  @ClassField(() => SupplierRefResDto)
  supplier!: SupplierRefResDto;

  @Expose()
  @NumberField({
    description: 'Đơn giá lần đặt mua gần nhất (đơn PO đã ORDERED)',
  })
  unitPrice!: number;

  @Expose()
  @DateField({ description: 'Ngày đặt mua gần nhất' })
  orderDate!: Date;
}
