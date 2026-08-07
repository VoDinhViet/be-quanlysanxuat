import { OrderItemStatus } from '../../../database/schemas';
import {
  EnumFieldOptional,
  NumberField,
  NumberFieldOptional,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';

export class OrderItemReqDto {
  @UUIDField({ description: 'Item id (FG hoặc WIP)' })
  readonly itemId!: string;

  @NumberField({ isPositive: true, description: 'Số lượng' })
  readonly quantity!: number;

  @NumberFieldOptional({
    min: 0,
    description: 'Đơn giá; defaults to 0',
  })
  readonly unitPrice?: number;

  @NumberFieldOptional({
    min: 0,
    max: 100,
    description: 'Chiết khấu (%) trên dòng; defaults to 0',
  })
  readonly discountPercent?: number;

  @StringFieldOptional({ nullable: true, maxLength: 500 })
  readonly note?: string | null;

  @EnumFieldOptional(() => OrderItemStatus, {
    description: 'Trạng thái dòng; defaults to NORMAL',
  })
  readonly status?: OrderItemStatus;

  @NumberFieldOptional({
    int: true,
    min: 0,
    description: 'STT — sibling order for drag-and-drop; defaults to 0',
  })
  readonly sortOrder?: number;
}
