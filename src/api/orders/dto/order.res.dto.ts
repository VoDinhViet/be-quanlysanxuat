import { Exclude, Expose } from 'class-transformer';

import { OrderStatus } from '../../../database/schemas';
import {
  BooleanField,
  ClassField,
  ClassFieldOptional,
  DateField,
  DateFieldOptional,
  EnumField,
  StringField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';
import { OrderClientRefResDto } from './order-client-ref.res.dto';
import { OrderCreatorResDto } from './order-creator.res.dto';
import { OrderItemResDto } from './order-item.res.dto';
import { OrderStaffRefResDto } from './order-staff-ref.res.dto';

@Exclude()
export class OrderResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField({ description: 'Order code' })
  code!: string;

  @Expose()
  @ClassField(() => OrderClientRefResDto)
  client!: OrderClientRefResDto;

  @Expose()
  @ClassFieldOptional(() => OrderStaffRefResDto, { nullable: true })
  staff!: OrderStaffRefResDto | null;

  @Expose()
  @DateField()
  orderDate!: Date;

  @Expose()
  @DateFieldOptional({ nullable: true })
  deliveryDate!: Date | null;

  @Expose()
  @StringFieldOptional({ nullable: true })
  paymentTerms!: string | null;

  @Expose()
  @EnumField(() => OrderStatus)
  status!: OrderStatus;

  @Expose()
  @StringField({
    description: 'Sum of item line totals (numeric, serialized as a string)',
  })
  totalAmount!: string;

  @Expose()
  @BooleanField({
    description:
      'Derived, not stored: deliveryDate < now && status not in (COMPLETED, CANCELLED)',
  })
  isOverdue!: boolean;

  @Expose()
  @StringFieldOptional({ nullable: true })
  note!: string | null;

  @Expose()
  @ClassFieldOptional(() => OrderItemResDto, {
    each: true,
    description: 'Only populated on GET /orders/:id, omitted on the list',
  })
  items?: OrderItemResDto[];

  @Expose()
  @ClassFieldOptional(() => OrderCreatorResDto, { nullable: true })
  creator!: OrderCreatorResDto | null;

  @Expose()
  @DateField()
  createdAt!: Date;

  @Expose()
  @DateField()
  updatedAt!: Date;
}
