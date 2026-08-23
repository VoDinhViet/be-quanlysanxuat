import { Exclude, Expose } from 'class-transformer';

import { WarehouseType } from '../../../database/schemas';
import {
  DateField,
  EnumField,
  StringField,
  UUIDField,
} from '../../../decorators/field.decorators';

@Exclude()
export class WarehouseResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField({ description: 'Mã kho' })
  code!: string;

  @Expose()
  @StringField({ description: 'Tên kho' })
  name!: string;

  @Expose()
  @EnumField(() => WarehouseType, {
    description: 'Nhãn phân loại/lọc — không ràng buộc mặt hàng được nhập/xuất',
  })
  type!: WarehouseType;

  @Expose()
  @DateField()
  createdAt!: Date;

  @Expose()
  @DateField()
  updatedAt!: Date;
}
