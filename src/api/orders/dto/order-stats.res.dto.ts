import { Exclude, Expose } from 'class-transformer';

import { NumberField } from '../../../decorators/field.decorators';

@Exclude()
export class OrderStatsResDto {
  @Expose()
  @NumberField({ description: 'Total number of orders', int: true })
  totalOrders!: number;

  @Expose()
  @NumberField({ description: 'Sum of totalAmount across all orders' })
  totalValue!: number;

  @Expose()
  @NumberField({
    description: 'Orders past deliveryDate, not COMPLETED/CANCELLED',
    int: true,
  })
  overdue!: number;

  @Expose()
  @NumberField({ description: 'Orders with status = DRAFT', int: true })
  draft!: number;

  @Expose()
  @NumberField({ description: 'Orders with status = CONFIRMED', int: true })
  confirmed!: number;

  @Expose()
  @NumberField({ description: 'Orders with status = IN_PROGRESS', int: true })
  inProgress!: number;

  @Expose()
  @NumberField({ description: 'Orders with status = COMPLETED', int: true })
  completed!: number;

  @Expose()
  @NumberField({ description: 'Orders with status = CANCELLED', int: true })
  cancelled!: number;
}
