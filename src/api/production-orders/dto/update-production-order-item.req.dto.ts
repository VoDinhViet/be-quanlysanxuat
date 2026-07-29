import { NumberField, UUIDField } from '../../../decorators/field.decorators';

export class UpdateProductionOrderItemReqDto {
  @UUIDField({
    description: 'order_items.id — must belong to this order, status NORMAL',
  })
  readonly orderItemId!: string;

  @NumberField({ min: 0, description: 'Đề xuất SX' })
  readonly quantity!: number;
}
