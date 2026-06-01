import { Exclude, Expose, Type } from 'class-transformer';

import { OrderStatus } from '../../../database/schemas';
import {
  ClassField,
  DateField,
  EnumField,
  StringField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';
import { OrderClientResDto } from './order-client.res.dto';
import { OrderProductionItemResDto } from './order-production-item.res.dto';

@Exclude()
export class OrderProductionResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @Type(() => OrderClientResDto)
  @ClassField(() => OrderClientResDto)
  client!: OrderClientResDto;

  @Expose()
  @StringField()
  code!: string;

  @Expose()
  @StringField()
  prNumber!: string;

  @Expose()
  @DateField()
  dueDate!: Date;

  @Expose()
  @StringFieldOptional({ nullable: true })
  note!: string | null;

  @Expose()
  @EnumField(() => OrderStatus)
  status!: OrderStatus;

  @Expose()
  @Type(() => OrderProductionItemResDto)
  @ClassField(() => OrderProductionItemResDto, { each: true })
  items!: OrderProductionItemResDto[];

  @Expose()
  @DateField()
  createdAt!: Date;

  @Expose()
  @DateField()
  updatedAt!: Date;
}
