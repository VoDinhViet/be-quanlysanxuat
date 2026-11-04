import { Exclude, Expose } from 'class-transformer';

import {
  NumberField,
  StringFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

@Exclude()
export class OutsourcingOrderSummaryResDto {
  @Expose()
  @StringFieldOptional({ description: 'Trạng thái phiếu, khi groupBy=status' })
  status?: string;

  @Expose()
  @UUIDFieldOptional({ description: 'Id nhà cung cấp, khi groupBy=supplier' })
  supplierId?: string;

  @Expose()
  @StringFieldOptional({
    description: 'Tên nhà cung cấp, khi groupBy=supplier',
  })
  supplierName?: string;

  @Expose()
  @NumberField({
    description: 'Số phiếu gửi gia công ngoài (OS-OUT)',
    int: true,
  })
  orderCount!: number;
}
