import { Exclude, Expose } from 'class-transformer';

import {
  NumberField,
  NumberFieldOptional,
} from '../../../decorators/field.decorators';

@Exclude()
export class OrderStatsResDto {
  @Expose()
  @NumberField({ description: 'Total number of orders', int: true })
  totalOrders!: number;

  @Expose()
  @NumberFieldOptional({
    nullable: true,
    description:
      '% change vs last calendar month (by createdAt); null when last month had 0 orders',
  })
  totalOrdersTrendPercent!: number | null;

  @Expose()
  @NumberField({ description: 'Sum of total across all orders' })
  totalValue!: number;

  @Expose()
  @NumberFieldOptional({
    nullable: true,
    description:
      '% change vs last calendar month (by createdAt); null when last month had 0 value',
  })
  totalValueTrendPercent!: number | null;

  @Expose()
  @NumberField({
    description:
      'Đã giao (proxy — no delivery/DO tracking yet): sum(total) of COMPLETED orders',
  })
  completedValue!: number;

  @Expose()
  @NumberField({ description: '% of totalValue' })
  completedValuePercentOfTotal!: number;

  @Expose()
  @NumberField({ description: 'Orders with status = IN_PROGRESS', int: true })
  inProgress!: number;

  @Expose()
  @NumberField({ description: '% of totalOrders' })
  inProgressPercentOfTotal!: number;

  @Expose()
  @NumberField({
    description: 'Orders past dueDate, not COMPLETED/CANCELLED',
    int: true,
  })
  expired!: number;

  @Expose()
  @NumberField({
    int: true,
    description:
      "expired now minus expired as of 7 days ago (approximated against today's status — see service doc comment)",
  })
  expiredTrendCount!: number;

  @Expose()
  @NumberField({ description: 'Orders with status = COMPLETED', int: true })
  completed!: number;

  @Expose()
  @NumberField({ description: '% of totalOrders' })
  completedPercentOfTotal!: number;
}
