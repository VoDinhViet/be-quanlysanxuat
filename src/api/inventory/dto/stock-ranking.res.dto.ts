import { Exclude, Expose } from 'class-transformer';

import {
  NumberField,
  StringField,
  UUIDField,
} from '../../../decorators/field.decorators';

@Exclude()
export class StockRankingResDto {
  @Expose()
  @UUIDField({ description: 'Id hàng' })
  id!: string;

  @Expose()
  @StringField({ description: 'Mã hàng' })
  code!: string;

  @Expose()
  @StringField({ description: 'Tên hàng' })
  name!: string;

  @Expose()
  @NumberField({ description: 'Tồn thô (inventory_balances.quantity)' })
  quantity!: number;

  @Expose()
  @NumberField({ description: 'Mức tồn tối thiểu của mã hàng, 0 = không đặt' })
  minStock!: number;
}
