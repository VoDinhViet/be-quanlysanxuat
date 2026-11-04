import { Exclude, Expose } from 'class-transformer';

import { StringField, UUIDField } from '../../../decorators/field.decorators';

@Exclude()
export class OverdueOrderResDto {
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
  @StringField({ description: 'Hạn giao (YYYY-MM-DD)' })
  dueDate!: string;
}
