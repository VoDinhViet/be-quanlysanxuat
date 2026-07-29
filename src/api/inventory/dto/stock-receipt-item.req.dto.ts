import {
  NumberField,
  UUIDField,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

/** One line of `items[]` on create/update. */
export class StockReceiptItemReqDto {
  @UUIDField({ description: 'Product id (must be FINISHED_GOOD)' })
  readonly productId!: string;

  @NumberField({ isPositive: true, description: 'Số lượng' })
  readonly quantity!: number;

  @UUIDFieldOptional({
    nullable: true,
    description:
      'Dòng đơn hàng (order_items) được giao — chỉ hợp lệ trên phiếu xuất (type=OUT); productId phải khớp productId của dòng đơn hàng đó',
  })
  readonly orderItemId?: string | null;
}
