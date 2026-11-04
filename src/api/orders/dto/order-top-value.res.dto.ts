import { Exclude, Expose } from 'class-transformer';

import {
  NumberField,
  StringField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';

@Exclude()
export class OrderTopValueResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField({ description: 'Mã đơn hàng bán (SO)' })
  code!: string;

  @Expose()
  @StringField()
  clientName!: string;

  @Expose()
  @StringField()
  status!: string;

  @Expose()
  @StringFieldOptional({ nullable: true, description: 'Hạn giao (YYYY-MM-DD)' })
  dueDate!: string | null;

  @Expose()
  @NumberField({ description: 'Tổng giá trị đơn, quy VND' })
  totalValue!: number;
}
