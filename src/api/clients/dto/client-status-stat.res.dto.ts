import { Exclude, Expose } from 'class-transformer';

import { NumberField, StringField } from '../../../decorators/field.decorators';

@Exclude()
export class ClientStatusStatResDto {
  @Expose()
  @StringField({ description: 'ACTIVE là đang hoạt động' })
  status!: string;

  @Expose()
  @NumberField({ int: true, description: 'Số khách hàng chưa xóa' })
  clientCount!: number;
}
