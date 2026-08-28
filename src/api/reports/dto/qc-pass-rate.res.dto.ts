import { Exclude, Expose } from 'class-transformer';

import {
  DateField,
  NumberFieldOptional,
} from '../../../decorators/field.decorators';

@Exclude()
export class QcPassRateResDto {
  @Expose()
  @DateField({ description: 'Ngày (giờ VN)' })
  date!: Date;

  @Expose()
  @NumberFieldOptional({
    int: true,
    nullable: true,
    description:
      'Tỷ lệ đạt IQC trong ngày (%) — null nếu ngày đó không có lần kiểm nào',
  })
  iqcPassRate!: number | null;

  @Expose()
  @NumberFieldOptional({
    int: true,
    nullable: true,
    description:
      'Tỷ lệ đạt OQC trong ngày (%) — null nếu ngày đó không có lần kiểm nào',
  })
  oqcPassRate!: number | null;
}
