import {
  NumberField,
  StringFieldOptional,
  UUIDField,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

export class InventoryIssueItemReqDto {
  @UUIDField({ description: 'Id mặt hàng (item)' })
  readonly itemId!: string;

  @UUIDFieldOptional({
    description:
      'Đơn vị nhập liệu — mặc định đơn vị gốc của item; phải có trong item_units nếu khác',
  })
  readonly unitId?: string;

  @NumberField({ isPositive: true, description: 'Số lượng theo unitId' })
  readonly quantity!: number;

  @UUIDFieldOptional({
    description:
      'Dòng đơn hàng (order_items) được giao — chỉ hợp lệ khi item là FG; itemId phải khớp dòng đơn hàng đó',
  })
  readonly orderItemId?: string;

  @StringFieldOptional({ maxLength: 500 })
  readonly note?: string;
}
