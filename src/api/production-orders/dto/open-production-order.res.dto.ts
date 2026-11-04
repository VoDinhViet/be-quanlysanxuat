import { Exclude, Expose } from 'class-transformer';

import { StringField, UUIDField } from '../../../decorators/field.decorators';

@Exclude()
export class OpenProductionOrderResDto {
  @Expose()
  @UUIDField({ description: 'Id lệnh sản xuất' })
  id!: string;

  @Expose()
  @StringField({ description: 'Mã lệnh sản xuất (LSX)' })
  code!: string;

  @Expose()
  @StringField({ description: 'Mã đơn bán (SO) của lệnh' })
  orderCode!: string;

  @Expose()
  @StringField({ description: 'Trạng thái LSX: PENDING hoặc APPROVED' })
  status!: string;
}
