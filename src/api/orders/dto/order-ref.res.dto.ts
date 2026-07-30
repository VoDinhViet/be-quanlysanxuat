import { Exclude, Expose } from 'class-transformer';

import {
  ClassFieldOptional,
  DateField,
  DateFieldOptional,
  StringField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';
import { OrderClientRefResDto } from './order-client-ref.res.dto';

/** Lightweight reference to the order a resource belongs to, nested inside another module's
 * response DTO (e.g. `ProductionOrderDetailResDto`). */
@Exclude()
export class OrderRefResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField()
  code!: string;

  @Expose()
  @ClassFieldOptional(() => OrderClientRefResDto, { nullable: true })
  client!: OrderClientRefResDto | null;

  @Expose()
  @DateField({ description: 'Ngày đặt hàng' })
  orderDate!: Date;

  @Expose()
  @DateFieldOptional({ nullable: true, description: 'Ngày giao hàng yêu cầu' })
  dueDate!: Date | null;

  @Expose()
  @StringFieldOptional({ nullable: true })
  note!: string | null;
}
