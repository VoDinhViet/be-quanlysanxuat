import { Exclude, Expose } from 'class-transformer';

import { NumberField } from '../../../decorators/field.decorators';

@Exclude()
export class PendingApprovalsResDto {
  @Expose()
  @NumberField({
    int: true,
    description:
      'Count of purchase requests with status PENDING_APPROVAL — 0 if the current user lacks purchase-requests:approve',
  })
  purchaseRequests!: number;

  @Expose()
  @NumberField({
    int: true,
    description:
      'Count of purchase quotations (RFQ) with status PENDING_APPROVAL — 0 if the current user lacks purchasing:approve',
  })
  purchaseQuotations!: number;

  @Expose()
  @NumberField({
    int: true,
    description:
      'Count of orders (SO) with status PENDING_CONFIRMATION — 0 if the current user lacks orders:approve',
  })
  orders!: number;

  @Expose()
  @NumberField({
    int: true,
    description:
      'Count of production orders (LSX) with status PENDING — 0 if the current user lacks production:approve',
  })
  productionOrders!: number;

  @Expose()
  @NumberField({
    int: true,
    description:
      'Count of inventory requisitions with status PENDING_APPROVAL — 0 if the current user lacks inventory-requisitions:approve',
  })
  inventoryRequisitions!: number;

  @Expose()
  @NumberField({
    int: true,
    description:
      'Count of outbound orders (DO) with status PENDING_APPROVAL — 0 if the current user lacks outbound:approve',
  })
  outboundOrders!: number;
}
