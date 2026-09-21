import { Exclude, Expose } from 'class-transformer';

import { NumberField } from '../../../decorators/field.decorators';

@Exclude()
export class ReportAlertsResDto {
  @Expose()
  @NumberField({
    int: true,
    description:
      "Count of production jobs with status not COMPLETED whose jobDueDate (the parent sales order's dueDate — jobs have no dueDate of their own) is before today (Asia/Ho_Chi_Minh)",
  })
  jobDueDate!: number;

  @Expose()
  @NumberField({
    int: true,
    description:
      'Count of outsourcing orders (OS-OUT) with status POSTED whose expectedReturnDate is before today (Asia/Ho_Chi_Minh) and received quantity (via posted OS-IN receipts) is still less than sent quantity',
  })
  outsourcingOrderDueDate!: number;

  @Expose()
  @NumberField({
    int: true,
    description:
      'QC requests (IQC + OQC) with result FAIL and status not COMPLETED — open non-conformances',
  })
  openNcr!: number;

  @Expose()
  @NumberField({
    int: true,
    description:
      'Outbound orders (DO) with status PENDING_DELIVERY and fulfillmentDate within the next 3 days from today, inclusive of today',
  })
  upcomingDeliveries!: number;
}
