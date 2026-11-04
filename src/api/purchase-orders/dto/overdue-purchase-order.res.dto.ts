import { Exclude, Expose } from 'class-transformer';

import {
  NumberField,
  StringField,
  UUIDField,
} from '../../../decorators/field.decorators';

@Exclude()
export class OverduePurchaseOrderResDto {
  @Expose()
  @UUIDField({ description: 'Id đơn mua' })
  id!: string;

  @Expose()
  @StringField({ description: 'Mã đơn mua (DMH)' })
  code!: string;

  @Expose()
  @StringField({ description: 'Tên nhà cung cấp' })
  supplierName!: string;

  @Expose()
  @StringField({ description: 'Ngày dự kiến nhận hàng (YYYY-MM-DD)' })
  expectedDate!: string;

  @Expose()
  @NumberField({ int: true, description: 'Số ngày trễ so với ngày dự kiến' })
  daysOverdue!: number;

  @Expose()
  @NumberField({ description: 'Tổng số lượng đặt' })
  orderedQuantity!: number;

  @Expose()
  @NumberField({
    description: 'Tổng số lượng đã nhận (phiếu nhập mua đã ghi sổ)',
  })
  receivedQuantity!: number;
}
