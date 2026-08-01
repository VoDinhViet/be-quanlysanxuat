import { Exclude, Expose } from 'class-transformer';

import {
  BooleanField,
  ClassFieldOptional,
  NumberField,
} from '../../../decorators/field.decorators';
import { OrderBaseResDto } from './order-base.res.dto';
import { OrderCreatorResDto } from './order-creator.res.dto';
import { OrderStaffRefResDto } from './order-staff-ref.res.dto';

@Exclude()
export class OrderResDto extends OrderBaseResDto {
  @Expose()
  @ClassFieldOptional(() => OrderStaffRefResDto, { nullable: true })
  staff!: OrderStaffRefResDto | null;

  @Expose()
  @ClassFieldOptional(() => OrderCreatorResDto, { nullable: true })
  approver!: OrderCreatorResDto | null;

  @Expose()
  @ClassFieldOptional(() => OrderCreatorResDto, { nullable: true })
  rejecter!: OrderCreatorResDto | null;

  @Expose()
  @ClassFieldOptional(() => OrderCreatorResDto, { nullable: true })
  creator!: OrderCreatorResDto | null;

  @Expose()
  @NumberField({
    description:
      'TỔNG THANH TOÁN quy đổi VND — server-computed: total * exchangeRate',
  })
  totalVnd!: number;

  @Expose()
  @BooleanField({
    description:
      'Derived, not stored: dueDate < now && status not in (COMPLETED, CANCELLED)',
  })
  expired!: boolean;
}
