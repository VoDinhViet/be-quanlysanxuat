import { PickType } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';

import { PurchaseOrderResDto } from './purchase-order.res.dto';

@Exclude()
export class PurchaseOrderRefResDto extends PickType(PurchaseOrderResDto, [
  'id',
  'code',
] as const) {}
