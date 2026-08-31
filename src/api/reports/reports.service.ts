import { Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import {
  and,
  asc,
  eq,
  gte,
  inArray,
  isNull,
  lt,
  lte,
  ne,
  sql,
} from 'drizzle-orm';
import type { Column, SQL } from 'drizzle-orm';

import { exclusiveEndOfDay } from '../../common/utils/date-range.util';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import {
  IqcResult,
  orders,
  OrderStatus,
  outboundOrders,
  OutboundOrderStatus,
  outsourcingOrders,
  OutsourcingOrderStatus,
  ProductionJobStatus,
  productionJobs,
  productionOrders,
  QcKind,
  QualityInspectionDecision,
  QualityInspectionStatus,
  QualityInspectionType,
  qualityInspectionResults,
  qualityInspections,
  suppliers,
} from '../../database/schemas';
import { GetProductionProgressReqDto } from './dto/get-production-progress.req.dto';
import { GetReportStatsReqDto } from './dto/get-report-stats.req.dto';
import { JobDueDateResDto } from './dto/job-due-date.res.dto';
import { OpenNcrResDto } from './dto/open-ncr.res.dto';
import { OutsourcingOrderDueDateResDto } from './dto/outsourcing-order-due-date.res.dto';
import { ProductionProgressResDto } from './dto/production-progress.res.dto';
import { QcPassRateResDto } from './dto/qc-pass-rate.res.dto';
import { ReportAlertsResDto } from './dto/report-alerts.res.dto';
import { ReportStatsResDto } from './dto/report-stats.res.dto';

type ReportDateRange = { startDate?: Date; endDate?: Date };

// Cột `timestamp` (có giờ) — cận trên dùng `exclusiveEndOfDay`, không `lte endDate` (sẽ loại sai
// bản ghi xảy ra sau nửa đêm của ngày cuối). Dùng cho cả 3 mốc `approvedAt`/`startedAt`/`createdAt`
// bên dưới; cột `date` (`orders.dueDate`) khác bản chất — không cần +1 ngày — dùng `dateRangeFilter`.
function timestampRangeFilter<TColumn extends Column>(
  column: TColumn,
  range: ReportDateRange,
): SQL | undefined {
  return and(
    range.startDate ? gte(column, range.startDate) : undefined,
    range.endDate ? lt(column, exclusiveEndOfDay(range.endDate)) : undefined,
  );
}

// Cột `date` (không giờ, vd `orders.dueDate`) — `lte(column, endDate)` là đủ, không cần +1 ngày
// như `timestampRangeFilter`.
function dateRangeFilter<TColumn extends Column>(
  column: TColumn,
  range: ReportDateRange,
): SQL | undefined {
  return and(
    range.startDate ? gte(column, range.startDate) : undefined,
    range.endDate ? lte(column, range.endDate) : undefined,
  );
}

// Server có thể chạy UTC còn nghiệp vụ tính theo giờ VN — `current_date` trần sẽ khiến "hôm nay"
// bắt đầu lúc 07:00 giờ VN. Mọi mốc ngày trong file này đi qua hằng này.
const VN_TODAY = sql`(now() at time zone 'Asia/Ho_Chi_Minh')::date`;

// `${days}` bơm vào như bound param kiểu `unknown` — Postgres không tự chọn được overload
// `date + integer` giữa `date + integer`/`date + interval`, ném "could not choose a best candidate
// operator" (42725). `::int` ép kiểu tường minh cho tham số.
function withinDaysFromToday<TColumn extends Column>(
  column: TColumn,
  days: number,
): SQL {
  return and(
    gte(column, VN_TODAY),
    lt(column, sql`${VN_TODAY} + ${days}::int`),
  )!;
}

// Định nghĩa "NCR chưa xử lý", dùng chung cho `/reports/stats` lẫn `/reports/alerts` — hai endpoint
// cùng trả field `openNcr` nên phải cùng một định nghĩa, không khai lại ở mỗi nơi.
const OPEN_NCR = and(
  eq(
    qualityInspections.decision,
    IqcResult.FAIL as string as QualityInspectionDecision,
  ),
  ne(qualityInspections.status, QualityInspectionStatus.COMPLETED),
)!;

// "Job trễ hạn" — jobDueDate (orders.dueDate của đơn hàng gốc, qua productionOrders) đã qua hôm
// nay và Job chưa COMPLETED. Dùng chung cho getJobDueDateCount lẫn getJobDueDate — không khai lại
// rule ở 2 nơi. Xem `docs/domains/production.md` (mục jobDueDate).
const JOB_DUE_DATE_PASSED = and(
  isNull(orders.deletedAt),
  ne(productionJobs.status, ProductionJobStatus.COMPLETED),
  lt(orders.dueDate, VN_TODAY),
)!;

/** Gộp KPI của 3 domain (`orders`/`production`/`quality`) cho trang Bảng điều khiển — không sở hữu
 * business rule nào, chỉ đọc lại rule đã có ở domain gốc. Không filter → mọi số + trend tính đến
 * hiện tại. Có `startDate`/`endDate` → mỗi nhóm lọc thêm theo đúng 1 cột mốc ngày của domain nó
 * (giao với điều kiện trạng thái sẵn có, không thay thế), và mọi field trend/window trả `null` —
 * so với "hôm qua"/"tuần trước" không còn nghĩa khi đang xem một khoảng ngày tuỳ ý. Trend không
 * filter tính lúc đọc, không có bảng lịch sử trạng thái nên hầu hết chỉ ra delta ≥ 0 — ngoại lệ
 * `openNcrTrendCount` (dựng lại từ `qc_inspections`, có thể âm). Xem
 * `docs/decisions/report-trends-derived.md`. */
@Injectable()
export class ReportsService {
  private static readonly UPCOMING_DUE_DAYS = 3;
  private static readonly UPCOMING_DELIVERY_DAYS = 3;
  private static readonly JOB_DUE_DATE_LIMIT = 5;
  private static readonly OUTSOURCING_ORDER_DUE_DATE_LIMIT = 5;
  private static readonly OPEN_NCR_LIMIT = 5;
  private static readonly QC_PASS_RATE_WINDOW_DAYS = 7;

  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async getStats(reqDto: GetReportStatsReqDto): Promise<ReportStatsResDto> {
    const [ordersStats, jobsStats, qcStats] = await Promise.all([
      this.getOrdersStats(reqDto),
      this.getJobsStats(reqDto),
      this.getQcStats(reqDto),
    ]);

    return plainToInstance(
      ReportStatsResDto,
      { ...ordersStats, ...jobsStats, ...qcStats },
      { excludeExtraneousValues: true },
    );
  }

  async getAlerts(): Promise<ReportAlertsResDto> {
    const [jobDueDate, outsourcingOrderDueDate, openNcr, upcomingDeliveries] =
      await Promise.all([
        this.getJobDueDateCount(),
        this.getOutsourcingOrderDueDateCount(),
        this.getOpenNcrCount(),
        this.getUpcomingDeliveriesCount(),
      ]);

    return plainToInstance(
      ReportAlertsResDto,
      {
        jobDueDate,
        outsourcingOrderDueDate,
        openNcr,
        upcomingDeliveries,
      },
      { excludeExtraneousValues: true },
    );
  }

  // Top JOB_DUE_DATE_LIMIT Job trễ hạn nhất (jobDueDate xa hôm nay nhất trước), cho widget "Job trễ
  // hạn" ở Bảng điều khiển — không phân trang, cùng khuôn `getProductionProgress`/`getAlerts`.
  async getJobDueDate(): Promise<JobDueDateResDto[]> {
    const rows = await this.db
      .select({
        id: productionJobs.id,
        code: productionJobs.code,
        orderCode: orders.code,
        dueDate: orders.dueDate,
        status: productionJobs.status,
      })
      .from(productionJobs)
      .innerJoin(
        productionOrders,
        eq(productionJobs.productionOrderId, productionOrders.id),
      )
      .innerJoin(orders, eq(productionOrders.orderId, orders.id))
      .where(JOB_DUE_DATE_PASSED)
      .orderBy(asc(orders.dueDate))
      .limit(ReportsService.JOB_DUE_DATE_LIMIT);

    return plainToInstance(JobDueDateResDto, rows, {
      excludeExtraneousValues: true,
    });
  }

  // Top OUTSOURCING_ORDER_DUE_DATE_LIMIT OS-OUT trễ hạn nhất, cho widget "Gia công ngoài trễ hạn"
  // ở Bảng điều khiển — không phân trang, cùng khuôn `getJobDueDate`.
  async getOutsourcingOrderDueDate(): Promise<OutsourcingOrderDueDateResDto[]> {
    const rows = await this.db
      .select({
        id: outsourcingOrders.id,
        code: outsourcingOrders.code,
        supplierName: suppliers.name,
        expectedReturnDate: outsourcingOrders.expectedReturnDate,
      })
      .from(outsourcingOrders)
      .innerJoin(suppliers, eq(suppliers.id, outsourcingOrders.supplierId))
      .where(this.outsourcingOrderDuePassed())
      .orderBy(asc(outsourcingOrders.expectedReturnDate))
      .limit(ReportsService.OUTSOURCING_ORDER_DUE_DATE_LIMIT);

    return plainToInstance(OutsourcingOrderDueDateResDto, rows, {
      excludeExtraneousValues: true,
    });
  }

  // Top OPEN_NCR_LIMIT NCR chưa xử lý cũ nhất (createdAt sớm nhất trước), cho widget "NCR chưa xử
  // lý" ở Bảng điều khiển — không phân trang, cùng khuôn `getJobDueDate`/`getOutsourcingOrderDueDate`.
  async getOpenNcr(): Promise<OpenNcrResDto[]> {
    const rows = await this.db
      .select({
        id: qualityInspections.id,
        code: qualityInspections.inspectionNo,
        inspectionType: qualityInspections.inspectionType,
        createdAt: qualityInspections.createdAt,
        status: qualityInspections.status,
      })
      .from(qualityInspections)
      .where(OPEN_NCR)
      .orderBy(asc(qualityInspections.createdAt))
      .limit(ReportsService.OPEN_NCR_LIMIT);

    // `kind` là vocabulary API cũ (`QcKind`) — dịch theo đúng inspectionType của từng dòng.
    // `status` trả thẳng `quality_inspections.status` (`QualityInspectionStatus`) — OPEN_NCR đảm
    // bảo chỉ còn PENDING/IN_PROGRESS ở đây (decision=FAIL nên khác DRAFT, ne COMPLETED loại nốt).
    return plainToInstance(
      OpenNcrResDto,
      rows.map((row) => ({
        ...row,
        kind:
          row.inspectionType === QualityInspectionType.IQC
            ? QcKind.INCOMING
            : QcKind.OUTGOING,
      })),
      { excludeExtraneousValues: true },
    );
  }

  // Duy nhất trong module đọc `qc_inspections` (append-only, mỗi lần kiểm 1 dòng) thay vì
  // `qc_requests` (chỉ giữ trạng thái mới nhất) — cách duy nhất dựng lại tỷ lệ đạt theo TỪNG NGÀY
  // trong quá khứ mà không cần bảng snapshot, cùng tiền lệ `openNcrTrendCount`
  // (docs/decisions/report-trends-derived.md). `generate_series` đảm bảo đủ
  // QC_PASS_RATE_WINDOW_DAYS điểm kể cả ngày không có lần kiểm nào (LEFT JOIN, null khi ngày đó
  // không có lần kiểm nào của kind tương ứng).
  async getQcPassRate(): Promise<QcPassRateResDto[]> {
    const inspectionDay = sql`(${qualityInspectionResults.createdAt} at time zone 'Asia/Ho_Chi_Minh')::date`;
    const windowStart = sql`${VN_TODAY} - ${ReportsService.QC_PASS_RATE_WINDOW_DAYS - 1}::int`;

    const rows = await this.db
      .select({
        date: sql<Date>`d.day::date`,
        iqcPassRate: sql<number | null>`
          round(
            100.0 * count(*) filter (where ${qualityInspectionResults.inspectionType} = ${QualityInspectionType.IQC} and ${qualityInspectionResults.decision} = ${IqcResult.PASS})
            / nullif(count(*) filter (where ${qualityInspectionResults.inspectionType} = ${QualityInspectionType.IQC}), 0)
          )
        `,
        oqcPassRate: sql<number | null>`
          round(
            100.0 * count(*) filter (where ${qualityInspectionResults.inspectionType} = ${QualityInspectionType.OQC} and ${qualityInspectionResults.decision} = ${IqcResult.PASS})
            / nullif(count(*) filter (where ${qualityInspectionResults.inspectionType} = ${QualityInspectionType.OQC}), 0)
          )
        `,
      })
      .from(
        sql`generate_series(${windowStart}, ${VN_TODAY}, interval '1 day') as d(day)`,
      )
      .leftJoin(qualityInspectionResults, sql`${inspectionDay} = d.day::date`)
      .groupBy(sql`d.day`)
      .orderBy(sql`d.day`);

    return plainToInstance(QcPassRateResDto, rows, {
      excludeExtraneousValues: true,
    });
  }

  // Lọc theo `orders.deletedAt` dù `ProductionJobsService.getProductionJobs` không lọc (đơn đã xoá
  // mềm vẫn giữ LSX/Job) — cố ý đi theo `.claude/rules/database.md`, có thể khiến `total` ở đây nhỏ
  // hơn `pagination.totalRecords` của `GET /production-jobs` khi tồn tại đơn đã xoá.
  //
  // Một dòng, `count(*) filter` cho từng status (cùng khuôn `getOrdersStats`/`getQcStats`) thay vì
  // `GROUP BY` + gộp lại 5 status ở tầng JS — Postgres trả đủ 5 cột luôn, kể cả status không có Job
  // nào, không cần `Map`/`reduce` dựng `total` phía TS.
  async getProductionProgress(
    reqDto: GetProductionProgressReqDto,
  ): Promise<ProductionProgressResDto> {
    const [row] = await this.db
      .select({
        total: sql<number>`count(*)`.mapWith(Number),
        pending: sql<number>`
          count(*) filter (where ${productionJobs.status} = ${ProductionJobStatus.PENDING})
        `.mapWith(Number),
        inProgress: sql<number>`
          count(*) filter (where ${productionJobs.status} = ${ProductionJobStatus.IN_PROGRESS})
        `.mapWith(Number),
        waitingQc: sql<number>`
          count(*) filter (where ${productionJobs.status} = ${ProductionJobStatus.WAITING_QC})
        `.mapWith(Number),
        waitingDelivery: sql<number>`
          count(*) filter (where ${productionJobs.status} = ${ProductionJobStatus.WAITING_DELIVERY})
        `.mapWith(Number),
        completed: sql<number>`
          count(*) filter (where ${productionJobs.status} = ${ProductionJobStatus.COMPLETED})
        `.mapWith(Number),
      })
      .from(productionJobs)
      .innerJoin(
        productionOrders,
        eq(productionOrders.id, productionJobs.productionOrderId),
      )
      .innerJoin(orders, eq(orders.id, productionOrders.orderId))
      .where(
        and(isNull(orders.deletedAt), dateRangeFilter(orders.dueDate, reqDto)),
      );

    const countByStatus: Record<ProductionJobStatus, number> = {
      [ProductionJobStatus.PENDING]: row.pending,
      [ProductionJobStatus.IN_PROGRESS]: row.inProgress,
      [ProductionJobStatus.WAITING_QC]: row.waitingQc,
      [ProductionJobStatus.WAITING_DELIVERY]: row.waitingDelivery,
      [ProductionJobStatus.COMPLETED]: row.completed,
    };
    const breakdown = Object.values(ProductionJobStatus).map((status) => {
      const count = countByStatus[status];
      return {
        status,
        count,
        percent:
          row.total === 0 ? 0 : Math.round((count / row.total) * 1000) / 10,
      };
    });

    return plainToInstance(
      ProductionProgressResDto,
      { total: row.total, breakdown },
      { excludeExtraneousValues: true },
    );
  }

  private async getOrdersStats(reqDto: GetReportStatsReqDto) {
    const isFiltered = Boolean(reqDto.startDate || reqDto.endDate);

    // Neo `approvedAt`, không `createdAt` — đơn chỉ thực sự "chạy" từ lúc duyệt
    // (`OrdersService.approveOrder`), đơn tạo lâu mới duyệt không nên tính là đã chạy từ đó.
    const running = and(
      inArray(orders.status, [
        OrderStatus.AWAITING_PRODUCTION,
        OrderStatus.IN_PROGRESS,
      ]),
      timestampRangeFilter(orders.approvedAt, reqDto),
    )!;

    const dueDateInRange = dateRangeFilter(orders.dueDate, reqDto);
    // `dueDate` là cột `date` — so bằng `VN_TODAY` (không `now()`) để không tính nhầm đơn đến hạn
    // hôm nay là trễ. `dueDate IS NULL` tự rớt khỏi mọi filter dưới đây (`NULL < x` → NULL).
    //
    // `dueDatePassed` cố ý HẸP HƠN `OrdersService.getOrderStats.expired`: `running` chỉ gồm
    // AWAITING_PRODUCTION/IN_PROGRESS, còn `expired` tính cả DRAFT/PENDING_CONFIRMATION/REJECTED.
    // Hai con số phục vụ 2 mục đích khác nhau (Dashboard chỉ quan tâm đơn đang thực thi) — không
    // dùng thay nhau được, đây là quyết định có chủ đích, không phải lệch sót.
    const dueDatePassed = and(
      running,
      dueDateInRange,
      lt(orders.dueDate, VN_TODAY),
    )!;
    const dueDatePassedAsOfYesterday = and(
      running,
      dueDateInRange,
      lt(orders.dueDate, sql`${VN_TODAY} - 1`),
    )!;
    // Có filter → `endDate` (đã nằm trong `dueDateInRange`) là cận trên duy nhất, bỏ cửa sổ 3 ngày
    // cố định. Không filter → giữ nguyên cửa sổ mặc định như cũ.
    const upcomingDue = isFiltered
      ? and(running, dueDateInRange, gte(orders.dueDate, VN_TODAY))!
      : and(
          running,
          withinDaysFromToday(orders.dueDate, ReportsService.UPCOMING_DUE_DAYS),
        )!;
    const runningAWeekAgo = and(
      running,
      lt(orders.approvedAt, sql`now() - interval '7 days'`),
    )!;

    const [row] = await this.db
      .select({
        runningOrders: sql<number>`count(*) filter (where ${running})`.mapWith(
          Number,
        ),
        runningOrdersTrendPercent: sql<number | null>`round(
          case when count(*) filter (where ${runningAWeekAgo}) = 0 then null
            else (count(*) filter (where ${running})::numeric - count(*) filter (where ${runningAWeekAgo})::numeric)
                 / count(*) filter (where ${runningAWeekAgo}) * 100
          end, 1)`,
        orderDueDate: sql<number>`
          count(*) filter (where ${dueDatePassed})
        `.mapWith(Number),
        orderDueDateTrendCount: sql<number>`
          count(*) filter (where ${dueDatePassed}) - count(*) filter (where ${dueDatePassedAsOfYesterday})
        `.mapWith(Number),
        upcomingDueOrders:
          sql<number>`count(*) filter (where ${upcomingDue})`.mapWith(Number),
      })
      .from(orders)
      .where(isNull(orders.deletedAt));

    if (!isFiltered) {
      return {
        ...row,
        upcomingDueWindowDays: ReportsService.UPCOMING_DUE_DAYS,
      };
    }

    return {
      ...row,
      runningOrdersTrendPercent: null,
      orderDueDateTrendCount: null,
      upcomingDueWindowDays: null,
    };
  }

  private async getJobsStats(reqDto: GetReportStatsReqDto) {
    const isFiltered = Boolean(reqDto.startDate || reqDto.endDate);

    const jobRunning = and(
      eq(productionJobs.status, ProductionJobStatus.IN_PROGRESS),
      timestampRangeFilter(productionJobs.startedAt, reqDto),
    )!;
    // CHECK `chk_production_jobs_status_fields` ràng `IN_PROGRESS ⟺ started_at IS NOT NULL`, nên
    // filter theo `startedAt` không cần lặp lại điều kiện status.
    const jobStartedWithin24h = gte(
      productionJobs.startedAt,
      sql`now() - interval '1 day'`,
    );

    const [row] = await this.db
      .select({
        runningJobs: sql<number>`count(*) filter (where ${jobRunning})`.mapWith(
          Number,
        ),
        runningJobsTrendCount:
          sql<number>`count(*) filter (where ${jobStartedWithin24h})`.mapWith(
            Number,
          ),
      })
      .from(productionJobs);

    return isFiltered ? { ...row, runningJobsTrendCount: null } : row;
  }

  private async getQcStats(reqDto: GetReportStatsReqDto) {
    const isFiltered = Boolean(reqDto.startDate || reqDto.endDate);

    const createdInRange = timestampRangeFilter(
      qualityInspections.createdAt,
      reqDto,
    );

    const waitingQc = and(
      eq(qualityInspections.inspectionType, QualityInspectionType.OQC),
      eq(qualityInspections.status, QualityInspectionStatus.DRAFT),
      createdInRange,
    )!;
    const waitingQcAsOfYesterday = and(
      waitingQc,
      lt(qualityInspections.createdAt, sql`now() - interval '1 day'`),
    )!;
    // Cả IQC lẫn OQC — `PENDING` (FAIL chưa chọn disposition) không tính vào đây, đã thuộc `openNcr`.
    const openNcr = and(OPEN_NCR, createdInRange)!;
    // Có filter → `openNcrTrendCount` bị null-hoá ở cuối hàm, nên bỏ hẳn việc dựng subquery tương
    // quan bên dưới cho mỗi dòng `quality_inspections` — `sql\`false\`` để Postgres hằng-số-hoá
    // FILTER, không eval cho dòng nào.
    //
    // Không filter: "trạng thái tại thời điểm T trong quá khứ" — không đọc
    // `quality_inspections.status` (chỉ mirror trạng thái HIỆN TẠI) mà dò lại
    // `quality_inspection_results`: `resultingStatus` của attempt gần nhất có `createdAt < T`. Hai
    // giá trị PENDING/IN_PROGRESS (gộp WAITING_RETURN/REWORK cũ, D2) tương đương "FAIL, chưa xử lý
    // xong" — đúng định nghĩa `openNcr` ở trên nhưng nhìn từ quá khứ. Không có attempt nào trước T
    // (request tạo sau T, hoặc còn DRAFT lúc đó) → subquery trả NULL → tự động không tính, không
    // cần xử lý riêng.
    const openNcrAsOfYesterday = isFiltered
      ? sql`false`
      : and(
          createdInRange,
          sql`(
            select ${qualityInspectionResults.resultingStatus}
            from ${qualityInspectionResults}
            where ${qualityInspectionResults.qualityInspectionId} = ${qualityInspections.id}
              and ${qualityInspectionResults.createdAt} < now() - interval '1 day'
            order by ${qualityInspectionResults.createdAt} desc
            limit 1
          ) in (${QualityInspectionStatus.PENDING}, ${QualityInspectionStatus.IN_PROGRESS})`,
        )!;

    const [row] = await this.db
      .select({
        jobsWaitingQc: sql<number>`
          count(distinct ${qualityInspections.productionJobId}) filter (where ${waitingQc})
        `.mapWith(Number),
        jobsWaitingQcTrendCount: sql<number>`
          count(distinct ${qualityInspections.productionJobId}) filter (where ${waitingQc})
          - count(distinct ${qualityInspections.productionJobId}) filter (where ${waitingQcAsOfYesterday})
        `.mapWith(Number),
        openNcr: sql<number>`count(*) filter (where ${openNcr})`.mapWith(
          Number,
        ),
        openNcrTrendCount: sql<number>`
          count(*) filter (where ${openNcr}) - count(*) filter (where ${openNcrAsOfYesterday})
        `.mapWith(Number),
      })
      .from(qualityInspections);

    return isFiltered
      ? { ...row, jobsWaitingQcTrendCount: null, openNcrTrendCount: null }
      : row;
  }

  private async getJobDueDateCount(): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(productionJobs)
      .innerJoin(
        productionOrders,
        eq(productionJobs.productionOrderId, productionOrders.id),
      )
      .innerJoin(orders, eq(productionOrders.orderId, orders.id))
      .where(JOB_DUE_DATE_PASSED);

    return row.count;
  }

  // "Còn hàng chưa về đủ" giờ đọc thẳng từ `status` (đã gộp tiến độ — SENT/PARTIAL nghĩa là còn
  // treo, WAITING_QC/COMPLETED nghĩa là đã nhận đủ, `docs/decisions/outsourcing-order-status-progress-merge.md`)
  // — không cần JOIN thêm subquery SL gửi/nhận như trước. Dùng chung cho
  // getOutsourcingOrderDueDateCount lẫn getOutsourcingOrderDueDate — không khai lại rule ở 2 nơi.
  private outsourcingOrderDuePassed() {
    return and(
      inArray(outsourcingOrders.status, [
        OutsourcingOrderStatus.SENT,
        OutsourcingOrderStatus.PARTIAL,
      ]),
      lt(outsourcingOrders.expectedReturnDate, VN_TODAY),
    )!;
  }

  private async getOutsourcingOrderDueDateCount(): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(outsourcingOrders)
      .where(this.outsourcingOrderDuePassed());

    return row.count;
  }

  private async getOpenNcrCount(): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(qualityInspections)
      .where(OPEN_NCR);

    return row.count;
  }

  private async getUpcomingDeliveriesCount(): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(outboundOrders)
      .where(
        and(
          eq(outboundOrders.status, OutboundOrderStatus.PENDING_DELIVERY),
          withinDaysFromToday(
            outboundOrders.fulfillmentDate,
            ReportsService.UPCOMING_DELIVERY_DAYS,
          ),
        ),
      );

    return row.count;
  }
}
