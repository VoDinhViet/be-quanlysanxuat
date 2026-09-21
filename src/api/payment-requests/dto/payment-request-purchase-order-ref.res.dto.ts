import { PickType } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';

import { PurchaseOrderResDto } from '../../purchase-orders/dto/purchase-order.res.dto';

@Exclude()
export class PaymentRequestPurchaseOrderRefResDto extends PickType(
  PurchaseOrderResDto,
  [
    'id',
    'code',
    'orderDate',
    'paymentTerm',
    'expectedDate',
    'assignedUser',
  ] as const,
) {}
