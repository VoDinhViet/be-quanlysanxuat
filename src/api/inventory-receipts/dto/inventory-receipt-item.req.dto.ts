import { InventoryItemType } from '../../../database/schemas';
import {
  EnumField,
  NumberField,
  NumberFieldOptional,
  StringFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

export class InventoryReceiptItemReqDto {
  @EnumField(() => InventoryItemType)
  readonly itemType!: InventoryItemType;

  @UUIDFieldOptional({ description: 'Bắt buộc khi itemType=PRODUCT' })
  readonly productId?: string;

  @UUIDFieldOptional({ description: 'Bắt buộc khi itemType=MATERIAL' })
  readonly materialId?: string;

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
