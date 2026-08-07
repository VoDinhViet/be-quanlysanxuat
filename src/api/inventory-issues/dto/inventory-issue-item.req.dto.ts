import {
  NumberField,
  StringFieldOptional,
  UUIDField,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

export class InventoryIssueItemReqDto {
  @UUIDField({ description: 'Id mặt hàng (item)' })
  readonly itemId!: string;

  @NumberField({ isPositive: true, description: 'Số lượng' })
  readonly quantity!: number;

  @UUIDFieldOptional({
    description:
      'Dòng đơn hàng (order_items) được giao — chỉ hợp lệ khi item là FG; itemId phải khớp dòng đơn hàng đó',
  })
  readonly orderItemId?: string;

  @StringFieldOptional({ maxLength: 500 })
  readonly note?: string;
}
