import { Type } from 'class-transformer';
import { ArrayMinSize, IsOptional } from 'class-validator';

import {
  ClassFieldOptional,
  DateFieldOptional,
  NumberFieldOptional,
  StringFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';
import { CreateOrderItemReqDto } from './create-order.req.dto';

export class UpdateOrderReqDto {
  @UUIDFieldOptional()
  clientId?: string;

  @StringFieldOptional({ maxLength: 50 })
  code?: string;

  @StringFieldOptional({ maxLength: 50 })
  prNumber?: string;

  @DateFieldOptional()
  dueDate?: Date;

  @NumberFieldOptional({ int: true, min: 0, max: 10 })
  vatRate?: number;

  @StringFieldOptional({ nullable: true })
  note?: string | null;

  @IsOptional()
  @Type(() => CreateOrderItemReqDto)
  @ArrayMinSize(1)
  @ClassFieldOptional(() => CreateOrderItemReqDto, { each: true })
  items?: CreateOrderItemReqDto[];
}
