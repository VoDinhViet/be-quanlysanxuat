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
      'Count of purchase requests created by the current user with status DRAFT or REJECTED (still to be completed and sent for approval) — 0 if the current user lacks purchase-requests:create',
  })
  purchaseRequestsToSubmit!: number;

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
      'Count of inventory receipts waiting for the warehouse to post: IQC_COMPLETED (IQC done) or PENDING_RECEIPT (confirmed, no IQC) — visible to every user, no permission gate',
  })
  inventoryReceiptsToPost!: number;

  @Expose()
  @NumberField({
    int: true,
    description:
      'Count of payment requests (YCTT) with status DRAFT or REJECTED (waiting for the buyer to send them) — visible to every user, no permission gate',
  })
  paymentRequestsToSubmit!: number;

  @Expose()
  @NumberField({
    int: true,
    description:
      'Count of payment requests (YCTT) with status PENDING (sent, waiting for accounting) — visible to every user, no permission gate',
  })
  paymentRequestsPending!: number;

  @Expose()
  @NumberField({
    int: true,
    description:
      'Count of NCRs with status PENDING_APPROVAL (waiting for the director) — 0 if the current user lacks ncr:approve',
  })
  ncrsPending!: number;

  @Expose()
  @NumberField({
    int: true,
    description:
      'Count of NCRs with status OPEN, REJECTED or APPROVED (waiting for the handler to analyse, fix or choose a disposition) — 0 if the current user lacks ncr:update',
  })
  ncrsToProcess!: number;

  @Expose()
  @NumberField({
    int: true,
    description:
      'Count of outsourcing orders with status PENDING_APPROVAL — 0 if the current user lacks outsourcing:approve',
  })
  outsourcingOrdersPending!: number;

  @Expose()
  @NumberField({
    int: true,
    description:
      'Count of outsourcing orders with status DRAFT, REJECTED or APPROVED (waiting for the requester to edit, resubmit or confirm sending) — 0 if the current user lacks outsourcing:update',
  })
  outsourcingOrdersToProcess!: number;

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

  @Expose()
  @NumberField({
    int: true,
    description:
      'Count of IQC inspections waiting for IQC (status DRAFT = not inspected yet, or PENDING = FAIL waiting for a disposition) — visible to every user, no permission gate',
  })
  iqcToInspect!: number;

  @Expose()
  @NumberField({
    int: true,
    description:
      'Count of OQC inspections waiting for QC (status DRAFT = production requested QC, not inspected yet, or PENDING = FAIL waiting for a disposition) — visible to every user, no permission gate',
  })
  oqcToInspect!: number;
}
