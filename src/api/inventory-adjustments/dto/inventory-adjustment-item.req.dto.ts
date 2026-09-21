import {
  NumberField,
  StringFieldOptional,
  UUIDField,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

export class InventoryAdjustmentItemReqDto {
  @UUIDField({ description: 'Id mặt hàng (item)' })
  readonly itemId!: string;

  @UUIDFieldOptional({
    description:
      'Đơn vị nhập liệu — mặc định đơn vị gốc của item, chỉ để hiển thị',
  })
  readonly unitId?: string;

  @NumberField({
    isPositive: true,
    description: 'Số lượng — dấu suy từ adjustmentType',
  })
  readonly quantity!: number;

  @StringFieldOptional({ maxLength: 500 })
  readonly note?: string;
}
