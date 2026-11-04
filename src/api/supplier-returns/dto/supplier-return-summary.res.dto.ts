import { Exclude, Expose } from 'class-transformer';

import {
  NumberField,
  StringFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

@Exclude()
export class SupplierReturnSummaryResDto {
  @Expose()
  @StringFieldOptional({
    description: 'Trạng thái phiếu, có khi gom theo status',
  })
  status?: string;

  @Expose()
  @UUIDFieldOptional({
    description: 'Id nhà cung cấp, có khi gom theo supplier',
  })
  supplierId?: string;

  @Expose()
  @StringFieldOptional({
    description: 'Tên nhà cung cấp, có khi gom theo supplier',
  })
  supplierName?: string;

  @Expose()
  @NumberField({ int: true, description: 'Số phiếu trả nhà cung cấp' })
  returnCount!: number;

  @Expose()
  @NumberField({ description: 'Tổng số lượng trả' })
  totalQuantity!: number;
}
