import { Exclude, Expose } from 'class-transformer';

import {
  NumberField,
  StringField,
  UUIDField,
} from '../../../decorators/field.decorators';

@Exclude()
export class IqcSupplierFailRateResDto {
  @Expose()
  @UUIDField({ description: 'Id nhà cung cấp' })
  supplierId!: string;

  @Expose()
  @StringField({ description: 'Tên nhà cung cấp' })
  supplierName!: string;

  @Expose()
  @NumberField({ int: true, description: 'Số lần kiểm đầu vào đã xong' })
  inspectionCount!: number;

  @Expose()
  @NumberField({ int: true, description: 'Số lần không đạt' })
  failCount!: number;

  @Expose()
  @NumberField({ description: 'Tỉ lệ không đạt (%), làm tròn 1 chữ số' })
  failRate!: number;
}
