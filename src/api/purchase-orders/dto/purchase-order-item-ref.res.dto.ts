import { PickType } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';

import { PurchaseOrderItemResDto } from './purchase-order-item.res.dto';

@Exclude()
export class PurchaseOrderItemRefResDto extends PickType(
  PurchaseOrderItemResDto,
  ['id', 'quantity'] as const,
) {}
