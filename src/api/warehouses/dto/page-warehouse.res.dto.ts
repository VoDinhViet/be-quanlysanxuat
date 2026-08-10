import { Exclude, Expose } from 'class-transformer';

import { WarehouseStatus, WarehouseType } from '../../../database/schemas';
import {
  DateField,
  EnumField,
  StringField,
  UUIDField,
} from '../../../decorators/field.decorators';

@Exclude()
export class PageWarehouseResDto {
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
  @EnumField(() => WarehouseStatus)
  status!: WarehouseStatus;

  @Expose()
  @DateField()
  createdAt!: Date;

  @Expose()
  @DateField()
  updatedAt!: Date;
}
