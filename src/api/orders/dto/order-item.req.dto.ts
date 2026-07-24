import {
  NumberField,
  NumberFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';

/**
 * One product line of an order. `lineTotal` is never accepted here — it's always
 * server-computed as `quantity * unitPrice` (see `OrdersService`).
 */
export class OrderItemReqDto {
  @UUIDField({ description: 'Product id' })
  readonly productId!: string;

  // numeric(18,3) column — String()-ified in the service before insert.
  @NumberField({ isPositive: true, description: 'Quantity' })
  readonly quantity!: number;

  // numeric(18,2) column — String()-ified in the service before insert.
  @NumberField({ min: 0, description: 'Unit price' })
  readonly unitPrice!: number;

  @NumberFieldOptional({
    int: true,
    min: 0,
    description: 'Sibling order; defaults to 0',
  })
  readonly sortOrder?: number;
}
