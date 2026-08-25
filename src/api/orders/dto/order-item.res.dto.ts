import { Exclude, Expose } from 'class-transformer';

import { OrderItemStatus } from '../../../database/schemas';
import {
  ClassField,
  EnumField,
  NumberField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';
import { FileField } from '../../files/dto/file.field';
import { FileResDto } from '../../files/dto/file.res.dto';
import { ItemRefResDto } from '../../items/dto/item-ref.res.dto';
import { UnitRefResDto } from '../../units/dto/unit-ref.res.dto';

@Exclude()
export class OrderItemResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @NumberField({ description: 'Số lượng' })
  quantity!: number;

  @Expose()
  @NumberField({
    description: 'SL đã xuất/giao thật (từ inventory_transactions.orderItemId)',
  })
  issuedQty!: number;

  @Expose()
  @NumberField({
    description: 'quantity - issuedQty; có thể âm nếu bị xuất vượt SL đặt',
  })
  remainingQty!: number;

  @Expose()
  @NumberField({ description: 'Đơn giá' })
  unitPrice!: number;

  @Expose()
  @NumberField({ description: 'Chiết khấu (%) trên dòng' })
  discountPercent!: number;

  @Expose()
  @NumberField({
    description:
      'Thành tiền — server-computed: quantity * unitPrice * (1 - discountPercent/100)',
  })
  lineTotal!: number;

  @Expose()
  @StringFieldOptional({ nullable: true })
  note!: string | null;

  @Expose()
  @EnumField(() => OrderItemStatus)
  status!: OrderItemStatus;

  @Expose()
  @NumberField({ int: true, description: 'STT — sibling order' })
  sortOrder!: number;

  @Expose()
  @ClassField(() => ItemRefResDto)
  item!: ItemRefResDto;

  @Expose()
  @ClassField(() => UnitRefResDto)
  unit!: UnitRefResDto;

  @Expose()
  @FileField('imageFile', 'Item image')
  image!: FileResDto | null;
}
