import { Type } from 'class-transformer';
import { ArrayMinSize } from 'class-validator';

import {
  ClassField,
  DateField,
  NumberField,
  StringField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';

export class CreateOrderItemReqDto {
  @UUIDField()
  productId!: string;

  @StringFieldOptional({ maxLength: 50 })
  unit?: string;

  @NumberField({ min: 0.001 })
  quantity!: number;
}

export class CreateOrderReqDto {
  @UUIDField()
  clientId!: string;

  @StringField({ maxLength: 50 })
  code!: string;

  @StringField({ maxLength: 50 })
  prNumber!: string;

  @DateField()
  dueDate!: Date;

  @NumberField({ int: true, min: 0, max: 10 })
  vatRate!: number;

  @StringFieldOptional({ nullable: true })
  note?: string | null;

  @Type(() => CreateOrderItemReqDto)
  @ArrayMinSize(1)
  @ClassField(() => CreateOrderItemReqDto, { each: true })
  items!: CreateOrderItemReqDto[];
}
