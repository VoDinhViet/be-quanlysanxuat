import {
  NumberField,
  NumberFieldOptional,
  StringFieldOptional,
  UUIDField,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

export class InventoryReceiptItemReqDto {
  @UUIDField({ description: 'Id mặt hàng (item)' })
  readonly itemId!: string;

  @UUIDFieldOptional({
    description: 'Dòng đơn mua tương ứng — phải thuộc purchaseOrderId ở header',
  })
  readonly purchaseOrderItemId?: string;

  @UUIDFieldOptional({
    description:
      'Đơn vị nhập liệu — mặc định đơn vị gốc của item; phải có trong item_units nếu khác',
  })
  readonly unitId?: string;

  @NumberField({ isPositive: true, description: 'Số lượng theo unitId' })
  readonly quantity!: number;

  @NumberFieldOptional({
    min: 0,
    description: 'Đơn giá — chỉ để ghi kèm, không tổng hợp',
  })
  readonly unitPrice?: number;

  @StringFieldOptional({ maxLength: 500 })
  readonly note?: string;
}
