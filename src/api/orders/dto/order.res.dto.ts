import { Exclude, Expose, Type } from 'class-transformer';

import { OrderStatus } from '../../../database/schemas';
import {
  ClassField,
  DateField,
  DateFieldOptional,
  EnumField,
  NumberField,
  StringField,
  StringFieldOptional,
  UUIDField,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';
import { OrderClientResDto } from './order-client.res.dto';
import { OrderFileResDto } from './order-file.res.dto';
import { OrderItemResDto } from './order-item.res.dto';

@Exclude()
export class OrderResDto {
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
  @NumberField({ int: true })
  vatRate!: number;

  @Expose()
  @NumberField()
  subTotal!: number;

  @Expose()
  @NumberField()
  vatAmount!: number;

  @Expose()
  @NumberField()
  totalAfterVat!: number;

  @Expose()
  @EnumField(() => OrderStatus)
  status!: OrderStatus;

  @Expose()
  @UUIDFieldOptional({ nullable: true })
  approvedBy!: string | null;

  @Expose()
  @DateFieldOptional({ nullable: true })
  approvedAt!: Date | null;

  @Expose()
  @UUIDFieldOptional({ nullable: true })
  rejectedBy!: string | null;

  @Expose()
  @DateFieldOptional({ nullable: true })
  rejectedAt!: Date | null;

  @Expose()
  @StringFieldOptional({ nullable: true })
  rejectedReason!: string | null;

  @Expose()
  @Type(() => OrderItemResDto)
  @ClassField(() => OrderItemResDto, { each: true })
  items!: OrderItemResDto[];

  @Expose()
  @Type(() => OrderFileResDto)
  @ClassField(() => OrderFileResDto, { each: true })
  files!: OrderFileResDto[];

  @Expose()
  @DateField()
  createdAt!: Date;

  @Expose()
  @DateField()
  updatedAt!: Date;
}
