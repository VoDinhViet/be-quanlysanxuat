import { Exclude, Expose } from 'class-transformer';

import {
  NumberField,
  StringFieldOptional,
} from '../../../decorators/field.decorators';

@Exclude()
export class IqcInspectionRateResDto {
  @Expose()
  @StringFieldOptional({
    description: 'Ngày kiểm xong (YYYY-MM-DD, giờ VN); chỉ khi groupBy=day',
  })
  day?: string;

  @Expose()
  @StringFieldOptional({
    description: 'Tên nhà cung cấp; chỉ khi groupBy=supplier',
  })
  supplierName?: string;

  @Expose()
  @StringFieldOptional({
    nullable: true,
    description: 'Kết quả kiểm (PASS, FAIL...); null khi phiếu chưa có kết quả',
  })
  decision!: string | null;

  @Expose()
  @NumberField({ int: true, description: 'Số phiếu IQC đã xong' })
  inspectionCount!: number;
}
