import {
  NumberField,
  NumberFieldOptional,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';

export class InventoryReceiptItemReqDto {
  @UUIDField({ description: 'Id mặt hàng (item)' })
  readonly itemId!: string;

  @NumberField({ isPositive: true, description: 'Số lượng' })
  readonly quantity!: number;

  @NumberFieldOptional({
    min: 0,
    description: 'Đơn giá — chỉ để ghi kèm, không tổng hợp',
  })
  readonly unitPrice?: number;

  @StringFieldOptional({ maxLength: 500 })
  readonly note?: string;
}
