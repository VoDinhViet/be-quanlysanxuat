import { Exclude, Expose } from 'class-transformer';

import { FileField } from '../../files/dto/file.field';
import { FileResDto } from '../../files/dto/file.res.dto';
import {
  ClassField,
  NumberField,
  StringField,
  UUIDField,
} from '../../../decorators/field.decorators';
import { UnitResDto } from '../../units/dto/unit.res.dto';

@Exclude()
export class InventoryItemResDto {
  @Expose()
  @UUIDField({ description: 'Item id' })
  id!: string;

  @Expose()
  @StringField({ description: 'Item code' })
  code!: string;

  @Expose()
  @StringField({ description: 'Item name' })
  name!: string;

  @Expose()
  @ClassField(() => UnitResDto)
  unit!: UnitResDto;

  @Expose()
  @FileField('imageFile', 'Item image')
  image!: FileResDto | null;

  @Expose()
  @NumberField({
    description: 'Tồn thực tế — Σ IN − Σ OUT trên các phiếu chưa xoá',
  })
  onHand!: number;

  @Expose()
  @NumberField({
    description:
      'Đã giữ cho các đơn hàng CONFIRMED/IN_PROGRESS còn mở, trừ phần đã xuất giao',
  })
  reserved!: number;

  @Expose()
  @NumberField({ description: 'Tồn khả dụng = onHand − reserved' })
  available!: number;
}
