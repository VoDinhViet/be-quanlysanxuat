import { Exclude, Expose } from 'class-transformer';

import { OrderItemProductRefResDto } from '../../orders/dto/order-item-product-ref.res.dto';
import {
  ClassField,
  NumberField,
  UUIDField,
} from '../../../decorators/field.decorators';

/** Một dòng Tab2 của `GET /production-orders/:orderId` — một dòng PO NORMAL kèm bức tranh tồn kho. */
@Exclude()
export class ProductionOrderItemResDto {
  @Expose()
  @UUIDField({ description: 'order_items.id' })
  orderItemId!: string;

  @Expose()
  @ClassField(() => OrderItemProductRefResDto)
  product!: OrderItemProductRefResDto;

  @Expose()
  @NumberField({ description: 'SL PO — order_items.quantity' })
  orderQty!: number;

  @Expose()
  @NumberField({ description: 'Tồn TP — InventoryService onHand' })
  onHandQty!: number;

  @Expose()
  @NumberField({
    description:
      'Khả dụng — onHand trừ reserved của mọi PO khác (loại trừ chính PO đang xem)',
  })
  availableQty!: number;

  @Expose()
  @NumberField({
    description:
      'Đề xuất SX — editable; seeded from the formula, saved via PATCH',
  })
  quantity!: number;

  @Expose()
  @NumberField({ description: 'Lấy từ tồn — max(0, SL PO - Đề xuất SX)' })
  fromStockQty!: number;
}
