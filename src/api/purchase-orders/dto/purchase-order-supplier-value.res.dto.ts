import { Exclude, Expose } from 'class-transformer';

import {
  NumberField,
  StringField,
  UUIDField,
} from '../../../decorators/field.decorators';

@Exclude()
export class PurchaseOrderSupplierValueResDto {
  @Expose()
  @UUIDField({ description: 'Id nhà cung cấp' })
  supplierId!: string;

  @Expose()
  @StringField({ description: 'Tên nhà cung cấp' })
  supplierName!: string;

  @Expose()
  @NumberField({
    description:
      'Tổng giá trị các dòng đơn mua: đơn giá x (số lượng báo giá, nếu không có thì số lượng đặt)',
  })
  totalValue!: number;

  @Expose()
  @NumberField({ int: true, description: 'Số đơn mua (DMH)' })
  orderCount!: number;
}
