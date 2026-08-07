import { Exclude, Expose } from 'class-transformer';

import { OrderItemStatus } from '../../../database/schemas';
import {
  ClassField,
  EnumField,
  NumberField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';
import { OrderItemRefResDto } from './order-item-ref.res.dto';

@Exclude()
export class OrderItemResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @NumberField({ description: 'Số lượng' })
  quantity!: number;

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
  @ClassField(() => OrderItemRefResDto)
  item!: OrderItemRefResDto;
}
