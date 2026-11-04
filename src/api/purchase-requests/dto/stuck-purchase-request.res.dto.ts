import { Exclude, Expose } from 'class-transformer';

import {
  NumberField,
  StringField,
  UUIDField,
} from '../../../decorators/field.decorators';

@Exclude()
export class StuckPurchaseRequestResDto {
  @Expose()
  @UUIDField({ description: 'Id đề nghị mua' })
  id!: string;

  @Expose()
  @StringField({ description: 'Mã đề nghị mua' })
  code!: string;

  @Expose()
  @StringField({ description: 'Ngày cần hàng (YYYY-MM-DD)' })
  neededDate!: string;

  @Expose()
  @NumberField({
    int: true,
    description:
      'Số ngày tính từ ngày cần hàng đến hôm nay, âm khi chưa tới ngày cần',
  })
  daysOverdue!: number;

  @Expose()
  @NumberField({
    int: true,
    description: 'Số dòng còn hiệu lực chưa nằm trong đơn mua nào',
  })
  unorderedLineCount!: number;

  @Expose()
  @NumberField({ description: 'Tổng số lượng của các dòng chưa lên đơn' })
  unorderedQuantity!: number;
}
