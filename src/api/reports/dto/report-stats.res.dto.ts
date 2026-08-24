import { Exclude, Expose } from 'class-transformer';

import {
  NumberField,
  NumberFieldOptional,
} from '../../../decorators/field.decorators';

@Exclude()
export class ReportStatsResDto {
  @Expose()
  @NumberField({
    int: true,
    description: 'Orders with status AWAITING_PRODUCTION or IN_PROGRESS',
  })
  runningOrders!: number;

  @Expose()
  @NumberFieldOptional({
    nullable: true,
    description:
      '% change of runningOrders vs 7 days ago (by approvedAt); null when there were 0 running 7 days ago, or when a startDate/endDate filter is applied',
  })
  runningOrdersTrendPercent!: number | null;

  @Expose()
  @NumberField({
    int: true,
    description:
      'Running orders (AWAITING_PRODUCTION/IN_PROGRESS) with dueDate before today (Asia/Ho_Chi_Minh)',
  })
  overdueOrders!: number;

  @Expose()
  @NumberFieldOptional({
    nullable: true,
    description:
      'overdueOrders minus overdueOrders as of yesterday; null when a startDate/endDate filter is applied',
  })
  overdueOrdersTrendCount!: number | null;

  @Expose()
  @NumberField({
    int: true,
    description:
      'Running orders due within upcomingDueWindowDays from today, inclusive of today — or, with a startDate/endDate filter, dueDate within that range',
  })
  upcomingDueOrders!: number;

  @Expose()
  @NumberFieldOptional({
    nullable: true,
    description:
      'Window size backing upcomingDueOrders, in days; null when a startDate/endDate filter is applied (the filter itself is the window)',
  })
  upcomingDueWindowDays!: number | null;

  @Expose()
  @NumberField({
    int: true,
    description: 'Production jobs with status IN_PROGRESS',
  })
  runningJobs!: number;

  @Expose()
  @NumberFieldOptional({
    nullable: true,
    description:
      'Jobs started (startedAt) within the last 24 hours; null when a startDate/endDate filter is applied',
  })
  runningJobsTrendCount!: number | null;

  @Expose()
  @NumberField({
    int: true,
    description:
      'Distinct production jobs with an OQC request still NOT_INSPECTED',
  })
  jobsWaitingQc!: number;

  @Expose()
  @NumberFieldOptional({
    nullable: true,
    description:
      'jobsWaitingQc minus jobsWaitingQc as of yesterday; null when a startDate/endDate filter is applied',
  })
  jobsWaitingQcTrendCount!: number | null;

  @Expose()
  @NumberField({
    int: true,
    description:
      'QC requests (IQC + OQC) with result FAIL and status not COMPLETED — open non-conformances',
  })
  openNcr!: number;

  @Expose()
  @NumberFieldOptional({
    nullable: true,
    description:
      'openNcr minus openNcr as of yesterday (reconstructed from qc_inspections history — can be negative when more NCRs were resolved than raised); null when a startDate/endDate filter is applied',
  })
  openNcrTrendCount!: number | null;
}
