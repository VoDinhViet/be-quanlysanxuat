import {
  NumberField,
  StringFieldOptional,
  UUIDField,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

export class OutboundOrderItemReqDto {
  @UUIDField({ description: 'Dòng PO nguồn (order_items) cần giao' })
  readonly orderItemId!: string;

  @UUIDField({ description: 'Mặt hàng của dòng PO trên (snapshot từ popup)' })
  readonly itemId!: string;

  @UUIDFieldOptional({
    nullable: true,
    description: 'Job as-used sản xuất mặt hàng trên (snapshot từ popup)',
  })
  readonly productionJobId?: string | null;

  @NumberField({ isPositive: true, description: 'SL giao dòng này' })
  readonly quantity!: number;

  @StringFieldOptional({ maxLength: 500, description: 'Ghi chú dòng' })
  readonly note?: string;
}
