import { NumberField, UUIDField } from '../../../decorators/field.decorators';

export class UpdateProductionOrderItemReqDto {
  @UUIDField({
    description: 'order_items.id — phải là một dòng của chính LSX này',
  })
  readonly orderItemId!: string;

  @NumberField({
    min: 0,
    description: 'Số lượng sản xuất (Đề xuất SX) — nhập tay',
  })
  readonly quantity!: number;
}
