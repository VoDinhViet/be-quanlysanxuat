import { PickType } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';

import { OrderResDto } from './order.res.dto';

@Exclude()
export class OrderRefResDto extends PickType(OrderResDto, [
  'id',
  'code',
] as const) {}
