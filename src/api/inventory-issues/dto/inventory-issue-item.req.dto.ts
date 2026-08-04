import { InventoryItemType } from '../../../database/schemas';
import {
  EnumField,
  NumberField,
  StringFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

export class InventoryIssueItemReqDto {
  @EnumField(() => InventoryItemType)
  readonly itemType!: InventoryItemType;

  @UUIDFieldOptional({ description: 'Bắt buộc khi itemType=PRODUCT' })
  readonly productId?: string;

  @UUIDFieldOptional({ description: 'Bắt buộc khi itemType=MATERIAL' })
  readonly materialId?: string;

  @NumberField({ isPositive: true, description: 'Số lượng' })
  readonly quantity!: number;

  @UUIDFieldOptional({
    description:
      'Dòng đơn hàng (order_items) được giao — chỉ hợp lệ trên dòng itemType=PRODUCT; productId phải khớp dòng đơn hàng đó',
  })
  readonly orderItemId?: string;

  @StringFieldOptional({ maxLength: 500 })
  readonly note?: string;
}
