import { PickType } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';

import { PagePurchaseOrderResDto } from '../../../purchase-orders/dto/page-purchase-order.res.dto';

/** What the model sees for one purchase order. `supplier` is already the id/code/name reference. */
@Exclude()
export class PurchaseOrderSummaryResDto extends PickType(
  PagePurchaseOrderResDto,
  [
    'code',
    'supplier',
    'orderDate',
    'expectedDate',
    'progress',
    'itemCount',
  ] as const,
) {}
