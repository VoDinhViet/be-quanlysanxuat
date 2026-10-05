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
      'Count of approved purchase request lines that still have quantity not on any quotation (waiting to be quoted) — 0 if the current user lacks purchasing:create',
  })
  purchaseQuotationsToQuote!: number;

  @Expose()
  @NumberField({
    int: true,
    description:
      'Count of purchase orders (PO) with status PENDING_CONFIRMATION — 0 if the current user lacks purchasing:update',
  })
  purchaseOrders!: number;

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

  @Expose()
  @NumberField({
    int: true,
    description:
      'Count of inventory receipts with status IQC_COMPLETED (IQC done, waiting for the warehouse to post) — visible to every user, no permission gate',
  })
  inventoryReceiptsToPost!: number;

  @Expose()
  @NumberField({
    int: true,
    description:
      'Count of payment requests (YCTT) with status PENDING (waiting to be paid or cancelled) — visible to every user, no permission gate',
  })
  paymentRequestsPending!: number;

  @Expose()
  @NumberField({
    int: true,
    description:
      'Count of supplier returns with status DRAFT (auto-created when IQC confirms NG goods to return, waiting for the warehouse to post) — visible to every user, no permission gate',
  })
  supplierReturnsToPost!: number;

  @Expose()
  @NumberField({
    int: true,
    description:
      'Count of inventory issues with status DRAFT (auto-created when a requisition is approved, waiting for the warehouse to post) — visible to every user, no permission gate',
  })
  inventoryIssuesToPost!: number;
}
