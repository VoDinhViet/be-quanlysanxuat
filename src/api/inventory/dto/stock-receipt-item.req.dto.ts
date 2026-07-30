import {
  NumberField,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

/**
 * One line of `items[]` on create/update. Đúng một trong `productId`/`materialId` được gửi, khớp
 * `subject` của phiếu cha (`E086` nếu không) — xem `StockReceiptsService.ensureItemsValid`.
 */
export class StockReceiptItemReqDto {
  @UUIDFieldOptional({
    description:
      'Product id (must be FINISHED_GOOD) — chỉ gửi trên phiếu subject=FINISHED_GOOD',
  })
  readonly productId?: string;

  @UUIDFieldOptional({
    description: 'Material id — chỉ gửi trên phiếu subject=MATERIAL',
  })
  readonly materialId?: string;

  @NumberField({ isPositive: true, description: 'Số lượng' })
  readonly quantity!: number;

  @UUIDFieldOptional({
    nullable: true,
    description:
      'Dòng đơn hàng (order_items) được giao — chỉ hợp lệ trên phiếu xuất (type=OUT); productId phải khớp productId của dòng đơn hàng đó',
  })
  readonly orderItemId?: string | null;
}
