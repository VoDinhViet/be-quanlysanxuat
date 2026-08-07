import { Exclude, Expose } from 'class-transformer';

import { OrderItemRefResDto } from '../../orders/dto/order-item-ref.res.dto';
import {
  ClassField,
  NumberField,
  UUIDField,
} from '../../../decorators/field.decorators';

@Exclude()
export class ProductionOrderItemResDto {
  @Expose()
  @UUIDField({ description: 'order_items.id' })
  orderItemId!: string;

  @Expose()
  @ClassField(() => OrderItemRefResDto)
  item!: OrderItemRefResDto;

  @Expose()
  @NumberField({
    description: 'SL PO — order_items.quantity tại thời điểm duyệt',
  })
  orderQty!: number;

  @Expose()
  @NumberField({ description: 'Tồn TP tại thời điểm duyệt' })
  onHandQty!: number;

  @Expose()
  @NumberField({
    description:
      'Khả dụng tại thời điểm duyệt — onHand trừ reserved của mọi PO khác',
  })
  availableQty!: number;

  @Expose()
  @NumberField({ description: 'Đề xuất SX đã chốt lúc duyệt' })
  quantity!: number;

  @Expose()
  @NumberField({ description: 'Lấy từ tồn — max(0, SL PO - Đề xuất SX)' })
  fromStockQty!: number;
}
