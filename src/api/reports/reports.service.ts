import { Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { and, eq, gte, inArray, isNull, lt, lte, ne, sql } from 'drizzle-orm';
import type { Column, SQL } from 'drizzle-orm';

import { exclusiveEndOfDay } from '../../common/utils/date-range.util';
import { mapNullableNumber } from '../../common/utils/number.util';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import {
  IqcResult,
  IqcStatus,
  OqcStatus,
  orders,
  OrderStatus,
  ProductionJobStatus,
  productionJobs,
  qcInspections,
  QcKind,
  qcRequests,
} from '../../database/schemas';
import { GetReportStatsReqDto } from './dto/get-report-stats.req.dto';
import { ReportStatsResDto } from './dto/report-stats.res.dto';

// Cột `timestamp` (có giờ) — cận trên dùng `exclusiveEndOfDay`, không `lte endDate` (sẽ loại sai
// bản ghi xảy ra sau nửa đêm của ngày cuối). Dùng cho cả 3 mốc `approvedAt`/`startedAt`/`createdAt`
// bên dưới; cột `date` (`orders.dueDate`) khác bản chất — không cần +1 ngày — nên không đi qua đây.
function timestampRangeFilter<TColumn extends Column>(
  column: TColumn,
  reqDto: GetReportStatsReqDto,
): SQL | undefined {
  return and(
    reqDto.startDate ? gte(column, reqDto.startDate) : undefined,
    reqDto.endDate ? lt(column, exclusiveEndOfDay(reqDto.endDate)) : undefined,
  );
}

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

  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async getStats(reqDto: GetReportStatsReqDto): Promise<ReportStatsResDto> {
    const [ordersSummary, jobsSummary, qcSummary] = await Promise.all([
      this.getOrdersStats(reqDto),
      this.getJobsStats(reqDto),
      this.getQcStats(reqDto),
    ]);

    return plainToInstance(
      ReportStatsResDto,
      { ...ordersSummary, ...jobsSummary, ...qcSummary },
      { excludeExtraneousValues: true },
    );
  }

  private async getOrdersStats(reqDto: GetReportStatsReqDto) {
    const isFiltered = Boolean(reqDto.startDate || reqDto.endDate);

    // Server có thể chạy UTC còn nghiệp vụ tính theo giờ VN — `current_date` trần sẽ khiến "hôm
    // nay" bắt đầu lúc 07:00 giờ VN. Mọi mốc ngày trong query này đi qua hằng này.
    const today = sql`(now() at time zone 'Asia/Ho_Chi_Minh')::date`;

    // Neo `approvedAt`, không `createdAt` — đơn chỉ thực sự "chạy" từ lúc duyệt
    // (`OrdersService.approveOrder`), đơn tạo lâu mới duyệt không nên tính là đã chạy từ đó.
    const running = and(
      inArray(orders.status, [
        OrderStatus.AWAITING_PRODUCTION,
        OrderStatus.IN_PROGRESS,
      ]),
      timestampRangeFilter(orders.approvedAt, reqDto),
    )!;

    // `dueDate` là cột `date` (không giờ) nên `lte(dueDate, endDate)` là đủ, không cần +1 ngày.
    const dueDateInRange = and(
      reqDto.startDate ? gte(orders.dueDate, reqDto.startDate) : undefined,
      reqDto.endDate ? lte(orders.dueDate, reqDto.endDate) : undefined,
    );
    // `dueDate` là cột `date` — so bằng `today` (không `now()`) để không tính nhầm đơn đến hạn hôm
    // nay là trễ. `dueDate IS NULL` tự rớt khỏi mọi filter dưới đây (`NULL < x` → NULL).
    //
    // `overdue` cố ý HẸP HƠN `OrdersService.getOrderStats.expired`: `running` chỉ gồm
    // AWAITING_PRODUCTION/IN_PROGRESS, còn `expired` tính cả DRAFT/PENDING_CONFIRMATION/REJECTED.
    // Hai con số phục vụ 2 mục đích khác nhau (Dashboard chỉ quan tâm đơn đang thực thi) — không
    // dùng thay nhau được, đây là quyết định có chủ đích, không phải lệch sót.
    const overdue = and(running, dueDateInRange, lt(orders.dueDate, today))!;
    const overdueAsOfYesterday = and(
      running,
      dueDateInRange,
      lt(orders.dueDate, sql`${today} - 1`),
    )!;
    // Có filter → `endDate` (đã nằm trong `dueDateInRange`) là cận trên duy nhất, bỏ cửa sổ 3 ngày
    // cố định. Không filter → giữ nguyên cửa sổ mặc định như cũ.
    const upcomingDue = isFiltered
      ? and(running, dueDateInRange, gte(orders.dueDate, today))!
      : and(
          running,
          gte(orders.dueDate, today),
          lt(
            orders.dueDate,
            // `${...}` bơm vào như bound param kiểu `unknown` — Postgres không tự chọn được
            // overload `date + integer` giữa `date + integer`/`date + interval`, ném "could not
            // choose a best candidate operator" (42725). `::int` ép kiểu tường minh cho tham số.
            sql`${today} + ${ReportsService.UPCOMING_DUE_DAYS}::int`,
          ),
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
          end, 1)`.mapWith(mapNullableNumber),
        overdueOrders: sql<number>`count(*) filter (where ${overdue})`.mapWith(
          Number,
        ),
        overdueOrdersTrendCount: sql<number>`
          count(*) filter (where ${overdue}) - count(*) filter (where ${overdueAsOfYesterday})
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
      overdueOrdersTrendCount: null,
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

    const createdInRange = timestampRangeFilter(qcRequests.createdAt, reqDto);

    const waitingQc = and(
      eq(qcRequests.kind, QcKind.OUTGOING),
      eq(qcRequests.status, OqcStatus.NOT_INSPECTED),
      createdInRange,
    )!;
    const waitingQcAsOfYesterday = and(
      waitingQc,
      lt(qcRequests.createdAt, sql`now() - interval '1 day'`),
    )!;
    // Cả IQC lẫn OQC — `PENDING` (FAIL chưa chọn disposition) không tính vào đây, đã thuộc `openNcr`.
    const openNcr = and(
      eq(qcRequests.result, IqcResult.FAIL),
      ne(qcRequests.status, IqcStatus.COMPLETED),
      createdInRange,
    )!;
    // Có filter → `openNcrTrendCount` bị null-hoá ở cuối hàm, nên bỏ hẳn việc dựng subquery tương
    // quan bên dưới cho mỗi dòng `qc_requests` — `sql\`false\`` để Postgres hằng-số-hoá FILTER,
    // không eval cho dòng nào.
    //
    // Không filter: "trạng thái tại thời điểm T trong quá khứ" — không đọc `qc_requests.status`
    // (chỉ mirror trạng thái HIỆN TẠI) mà dò lại `qc_inspections`: `resultingStatus` của attempt
    // gần nhất có `createdAt < T`. Ba giá trị PENDING/WAITING_RETURN/REWORK tương đương "FAIL,
    // chưa xử lý xong" — đúng định nghĩa `openNcr` ở trên nhưng nhìn từ quá khứ. Không có attempt
    // nào trước T (request tạo sau T, hoặc còn NOT_INSPECTED lúc đó) → subquery trả NULL → tự động
    // không tính, không cần xử lý riêng.
    const openNcrAsOfYesterday = isFiltered
      ? sql`false`
      : and(
          createdInRange,
          sql`(
            select ${qcInspections.resultingStatus}
            from ${qcInspections}
            where ${qcInspections.qcRequestId} = ${qcRequests.id}
              and ${qcInspections.createdAt} < now() - interval '1 day'
            order by ${qcInspections.createdAt} desc
            limit 1
          ) in (${IqcStatus.PENDING}, ${IqcStatus.WAITING_RETURN}, ${OqcStatus.REWORK})`,
        )!;

    const [row] = await this.db
      .select({
        jobsWaitingQc: sql<number>`
          count(distinct ${qcRequests.productionJobId}) filter (where ${waitingQc})
        `.mapWith(Number),
        jobsWaitingQcTrendCount: sql<number>`
          count(distinct ${qcRequests.productionJobId}) filter (where ${waitingQc})
          - count(distinct ${qcRequests.productionJobId}) filter (where ${waitingQcAsOfYesterday})
        `.mapWith(Number),
        openNcr: sql<number>`count(*) filter (where ${openNcr})`.mapWith(
          Number,
        ),
        openNcrTrendCount: sql<number>`
          count(*) filter (where ${openNcr}) - count(*) filter (where ${openNcrAsOfYesterday})
        `.mapWith(Number),
      })
      .from(qcRequests);

    return isFiltered
      ? { ...row, jobsWaitingQcTrendCount: null, openNcrTrendCount: null }
      : row;
  }
}
