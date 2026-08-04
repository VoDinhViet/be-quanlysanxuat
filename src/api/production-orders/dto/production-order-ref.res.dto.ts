import { PickType } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';

import { ProductionOrderResDto } from './production-order.res.dto';

@Exclude()
export class ProductionOrderRefResDto extends PickType(ProductionOrderResDto, [
  'id',
  'code',
] as const) {}
