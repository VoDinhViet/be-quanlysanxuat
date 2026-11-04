import { Exclude, Expose } from 'class-transformer';

import {
  NumberField,
  StringField,
  UUIDField,
} from '../../../decorators/field.decorators';

@Exclude()
export class ProductionJobItemSummaryResDto {
  @Expose()
  @UUIDField({ description: 'Id hàng' })
  itemId!: string;

  @Expose()
  @StringField({ description: 'Mã hàng' })
  itemCode!: string;

  @Expose()
  @StringField({ description: 'Tên hàng' })
  itemName!: string;

  @Expose()
  @NumberField({ description: 'Số JOB', int: true })
  jobCount!: number;
}
