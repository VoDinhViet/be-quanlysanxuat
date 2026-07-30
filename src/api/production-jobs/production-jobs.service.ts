import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  gte,
  lte,
  or,
  sql,
} from 'drizzle-orm';

import { OffsetPaginationDto } from '../../common/dto/offset-pagination/offset-pagination.dto';
import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { unaccentILike } from '../../common/utils/search.util';
import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import type { Database, DbTransaction } from '../../database/database.type';
import {
  clients,
  credentials,
  files,
  orders,
  productionJobLogs,
  ProductionJobLogAction,
  productionJobs,
  ProductionJobStatus,
  productionOrders,
  products,
  units,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { CancelProductionJobReqDto } from './dto/cancel-production-job.req.dto';
import { GetProductionJobLogsReqDto } from './dto/get-production-job-logs.req.dto';
import { GetProductionJobsReqDto } from './dto/get-production-jobs.req.dto';
import { PauseProductionJobReqDto } from './dto/pause-production-job.req.dto';
import { ProductionJobLogResDto } from './dto/production-job-log.res.dto';
import { ProductionJobResDto } from './dto/production-job.res.dto';
import { ReportProductionJobReqDto } from './dto/report-production-job.req.dto';

/**
 * Job sản xuất — 1 sản phẩm (FG) = 1 Job trong một LSX (`production_jobs`), "Quản lý sản xuất" —
 * đơn vị công việc thực tế của xưởng, tách module riêng khỏi `production-orders` (LSX/header) vì
 * là một khái niệm/vòng đời khác.
 *
 * Rules:
 * - `createJobs` là đường ghi **duy nhất tạo mới** Job, chỉ gọi được từ transaction duyệt LSX của
 *   `ProductionOrdersService.approveProductionOrder` — module này không có route tạo Job riêng ở
 *   `/production-jobs*`, Job chỉ được tạo gián tiếp qua duyệt LSX.
 * - Bước phát hành cũ (`issueJobs`, gọi từ `issueProductionOrders`) đã bỏ 2026-07-30; `createJobs`
 *   sống lại cùng ngày, gắn vào bước duyệt (`approveProductionOrder`) thay vì phát hành — xem
 *   `docs/features/production.md`.
 * - Vòng đời sau khi Job đã tồn tại (`start`/`report`/`pause`/`resume`/`complete`/`cancel`, thêm
 *   2026-07-30) **có** route riêng ở đây — khác `createJobs`, các hành động này chỉnh sửa Job đã
 *   có, không tạo Job mới. Mỗi hành động ghi `production_job_logs` trong cùng transaction, cùng
 *   khuôn `ProductionOrdersService.logAction`.
 * - Không tự động chuyển `orders.status → COMPLETED` khi mọi Job của LSX xong, và không tự lập
 *   phiếu nhập kho thành phẩm khi `completeJob` — cả hai vẫn ngoài phạm vi, xem
 *   `docs/features/production.md`.
 */
@Injectable()
export class ProductionJobsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async getProductionJobs(
    reqDto: GetProductionJobsReqDto,
  ): Promise<OffsetPaginatedDto<ProductionJobResDto>> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;
    const where = and(
      reqDto.orderId ? eq(orders.id, reqDto.orderId) : undefined,
      reqDto.productId
        ? eq(productionJobs.productId, reqDto.productId)
        : undefined,
      reqDto.status ? eq(productionJobs.status, reqDto.status) : undefined,
      reqDto.clientId ? eq(orders.clientId, reqDto.clientId) : undefined,
      reqDto.fromDate ? gte(orders.dueDate, reqDto.fromDate) : undefined,
      reqDto.toDate ? lte(orders.dueDate, reqDto.toDate) : undefined,
      keyword
        ? or(
            unaccentILike(productionJobs.code, keyword),
            unaccentILike(productionOrders.code, keyword),
            unaccentILike(orders.code, keyword),
            unaccentILike(products.code, keyword),
            unaccentILike(products.name, keyword),
          )
        : undefined,
    );

    const [rows, countRows] = await Promise.all([
      this.baseJobSelect()
        .where(where)
        .orderBy(asc(orders.dueDate), desc(productionOrders.approvedAt))
        .limit(reqDto.limit)
        .offset(reqDto.offset),
      this.db
        .select({ total: count() })
        .from(productionJobs)
        .innerJoin(
          productionOrders,
          eq(productionOrders.id, productionJobs.productionOrderId),
        )
        .innerJoin(orders, eq(orders.id, productionOrders.orderId))
        .innerJoin(products, eq(products.id, productionJobs.productId))
        .where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(ProductionJobResDto, rows, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(countRows[0]?.total ?? 0, reqDto),
    );
  }

  async getProductionJobDetail(jobId: string): Promise<ProductionJobResDto> {
    const [row] = await this.baseJobSelect()
      .where(eq(productionJobs.id, jobId))
      .limit(1);

    if (!row) {
      throw new AppException(ErrorCode.E082, HttpStatus.NOT_FOUND);
    }

    return plainToInstance(ProductionJobResDto, row, {
      excludeExtraneousValues: true,
    });
  }

  /**
   * Sinh Job cho một LSX vừa duyệt — 1 Job/sản phẩm (SL > 0), gộp mọi dòng
   * `production_order_items` cùng `productId` trong LSX đó, mã `JOBxxxx`. Bắt buộc truyền `tx` vì
   * chỉ được gọi từ bên trong transaction duyệt của `ProductionOrdersService.approveProductionOrder`
   * (`.claude/rules/api-module.md`). Bỏ qua không tạo gì nếu không có sản phẩm nào SL > 0.
   */
  async createJobs(
    tx: DbTransaction,
    productionOrderId: string,
    quantityByProduct: Map<string, number>,
  ): Promise<void> {
    if (!quantityByProduct.size) {
      return;
    }

    const productIds = [...quantityByProduct.keys()];
    const codes = await this.generateJobCodes(tx, productIds.length);
    await tx.insert(productionJobs).values(
      productIds.map((productId, index) => ({
        code: codes[index],
        productionOrderId,
        productId,
        quantity: quantityByProduct.get(productId)!,
      })),
    );
  }

  /** `PENDING` → `IN_PROGRESS` (`E087` nếu không). Ghi `startedBy`/`startedAt` + log `STARTED`. */
  async startJob(jobId: string, userId: string): Promise<ProductionJobResDto> {
    const job = await this.ensureJobExists(jobId);
    this.ensureStatus(job.status, [ProductionJobStatus.PENDING]);

    await this.db.transaction(async (tx) => {
      await tx
        .update(productionJobs)
        .set({
          status: ProductionJobStatus.IN_PROGRESS,
          startedBy: userId,
          startedAt: new Date(),
        })
        .where(eq(productionJobs.id, jobId));
      await this.logAction(
        tx,
        jobId,
        ProductionJobLogAction.STARTED,
        'Bắt đầu sản xuất',
        userId,
      );
    });

    return this.getProductionJobDetail(jobId);
  }

  /**
   * Báo sản lượng một lần — chỉ hợp lệ từ `IN_PROGRESS` (`E087`). `producedQty`/`rejectedQty`
   * **cộng dồn** vào số đã có, không ghi đè; ít nhất một trong hai phải > 0 (`E089`); tổng sau khi
   * cộng không được vượt `quantity` (`E088`, kiểm ở đây để ra 400 sạch thay vì để lộ lỗi constraint
   * `chk_production_jobs_report_qty` 500 thô).
   */
  async reportJob(
    jobId: string,
    reqDto: ReportProductionJobReqDto,
    userId: string,
  ): Promise<ProductionJobResDto> {
    const job = await this.ensureJobExists(jobId);
    this.ensureStatus(job.status, [ProductionJobStatus.IN_PROGRESS]);

    const producedDelta = reqDto.producedQty ?? 0;
    const rejectedDelta = reqDto.rejectedQty ?? 0;
    if (producedDelta <= 0 && rejectedDelta <= 0) {
      throw new AppException(ErrorCode.E089, HttpStatus.BAD_REQUEST);
    }

    const producedQty = job.producedQty + producedDelta;
    const rejectedQty = job.rejectedQty + rejectedDelta;
    if (producedQty + rejectedQty > job.quantity) {
      throw new AppException(ErrorCode.E088, HttpStatus.BAD_REQUEST);
    }

    const content = `Báo sản lượng: +${producedDelta} đạt, +${rejectedDelta} phế${
      reqDto.note ? ` — ${reqDto.note}` : ''
    }`;

    await this.db.transaction(async (tx) => {
      await tx
        .update(productionJobs)
        .set({ producedQty, rejectedQty })
        .where(eq(productionJobs.id, jobId));
      await this.logAction(
        tx,
        jobId,
        ProductionJobLogAction.REPORTED,
        content,
        userId,
      );
    });

    return this.getProductionJobDetail(jobId);
  }

  /** `IN_PROGRESS` → `PAUSED` (`E087` nếu không). `reason` (tuỳ chọn) chỉ đi vào log — không có
   * cột riêng lưu lý do vì tạm dừng lặp lại được, một cột sẽ bị ghi đè mất lịch sử. */
  async pauseJob(
    jobId: string,
    reqDto: PauseProductionJobReqDto,
    userId: string,
  ): Promise<ProductionJobResDto> {
    const job = await this.ensureJobExists(jobId);
    this.ensureStatus(job.status, [ProductionJobStatus.IN_PROGRESS]);

    const content = `Tạm dừng${reqDto.reason ? `: ${reqDto.reason}` : ''}`;

    await this.db.transaction(async (tx) => {
      await tx
        .update(productionJobs)
        .set({ status: ProductionJobStatus.PAUSED })
        .where(eq(productionJobs.id, jobId));
      await this.logAction(
        tx,
        jobId,
        ProductionJobLogAction.PAUSED,
        content,
        userId,
      );
    });

    return this.getProductionJobDetail(jobId);
  }

  /** `PAUSED` → `IN_PROGRESS` (`E087` nếu không). */
  async resumeJob(jobId: string, userId: string): Promise<ProductionJobResDto> {
    const job = await this.ensureJobExists(jobId);
    this.ensureStatus(job.status, [ProductionJobStatus.PAUSED]);

    await this.db.transaction(async (tx) => {
      await tx
        .update(productionJobs)
        .set({ status: ProductionJobStatus.IN_PROGRESS })
        .where(eq(productionJobs.id, jobId));
      await this.logAction(
        tx,
        jobId,
        ProductionJobLogAction.RESUMED,
        'Tiếp tục sản xuất',
        userId,
      );
    });

    return this.getProductionJobDetail(jobId);
  }

  /**
   * `IN_PROGRESS`/`PAUSED` → `COMPLETED` (`E087` nếu không). Cho phép kết thúc sớm khi
   * `producedQty < quantity` — không bắt buộc phải báo đủ số mới hoàn thành được. Không tự lập
   * phiếu nhập kho thành phẩm, không tự chuyển `orders.status` — cả hai vẫn ngoài phạm vi, xem
   * `docs/features/production.md`.
   */
  async completeJob(
    jobId: string,
    userId: string,
  ): Promise<ProductionJobResDto> {
    const job = await this.ensureJobExists(jobId);
    this.ensureStatus(job.status, [
      ProductionJobStatus.IN_PROGRESS,
      ProductionJobStatus.PAUSED,
    ]);

    const content = `Hoàn thành: ${job.producedQty}/${job.quantity} đạt, ${job.rejectedQty} phế`;

    await this.db.transaction(async (tx) => {
      await tx
        .update(productionJobs)
        .set({
          status: ProductionJobStatus.COMPLETED,
          completedBy: userId,
          completedAt: new Date(),
        })
        .where(eq(productionJobs.id, jobId));
      await this.logAction(
        tx,
        jobId,
        ProductionJobLogAction.COMPLETED,
        content,
        userId,
      );
    });

    return this.getProductionJobDetail(jobId);
  }

  /** `PENDING`/`IN_PROGRESS`/`PAUSED` → `CANCELLED` (`E087` nếu không, kể cả gọi lại trên Job đã
   * `CANCELLED`/`COMPLETED`). `reason` bắt buộc, ghi vào cả `cancelReason` lẫn nội dung log. */
  async cancelJob(
    jobId: string,
    reqDto: CancelProductionJobReqDto,
    userId: string,
  ): Promise<ProductionJobResDto> {
    const job = await this.ensureJobExists(jobId);
    this.ensureStatus(job.status, [
      ProductionJobStatus.PENDING,
      ProductionJobStatus.IN_PROGRESS,
      ProductionJobStatus.PAUSED,
    ]);

    await this.db.transaction(async (tx) => {
      await tx
        .update(productionJobs)
        .set({
          status: ProductionJobStatus.CANCELLED,
          cancelledBy: userId,
          cancelledAt: new Date(),
          cancelReason: reqDto.reason,
        })
        .where(eq(productionJobs.id, jobId));
      await this.logAction(
        tx,
        jobId,
        ProductionJobLogAction.CANCELLED,
        `Huỷ: ${reqDto.reason}`,
        userId,
      );
    });

    return this.getProductionJobDetail(jobId);
  }

  /** Lịch sử thao tác Job (`production:read`) — sắp mới nhất trước, kèm người thực hiện
   * (`performer`, `null` nếu credential đã bị xoá). Trả `E082` nếu Job không tồn tại. */
  async getProductionJobLogs(
    jobId: string,
    reqDto: GetProductionJobLogsReqDto,
  ): Promise<OffsetPaginatedDto<ProductionJobLogResDto>> {
    await this.ensureJobExists(jobId);

    const where = eq(productionJobLogs.jobId, jobId);
    const [rows, countRows] = await Promise.all([
      this.db.query.productionJobLogs.findMany({
        where,
        with: { performer: true },
        orderBy: desc(productionJobLogs.createdAt),
        limit: reqDto.limit,
        offset: reqDto.offset,
      }),
      this.db.select({ total: count() }).from(productionJobLogs).where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(ProductionJobLogResDto, rows, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(countRows[0]?.total ?? 0, reqDto),
    );
  }

  /** Job không tồn tại → `E082`. Trả đủ số liệu vòng đời để các hành động dùng ngay, không phải
   * query lại. */
  private async ensureJobExists(jobId: string): Promise<{
    id: string;
    status: ProductionJobStatus;
    quantity: number;
    producedQty: number;
    rejectedQty: number;
  }> {
    const job = await this.db.query.productionJobs.findFirst({
      columns: {
        id: true,
        status: true,
        quantity: true,
        producedQty: true,
        rejectedQty: true,
      },
      where: eq(productionJobs.id, jobId),
    });

    if (!job) {
      throw new AppException(ErrorCode.E082, HttpStatus.NOT_FOUND);
    }

    return job;
  }

  /** Chặn chuyển trạng thái không hợp lệ — `E087` nếu `current` không thuộc `allowed`. */
  private ensureStatus(
    current: ProductionJobStatus,
    allowed: ProductionJobStatus[],
  ): void {
    if (!allowed.includes(current)) {
      throw new AppException(ErrorCode.E087, HttpStatus.CONFLICT);
    }
  }

  /** Ghi 1 dòng lịch sử thao tác — luôn gọi trong transaction của hành động đang log, không tách
   * rời (log và hành động cùng commit hoặc cùng rollback). Khuôn
   * `ProductionOrdersService.logAction`. */
  private async logAction(
    tx: DbTransaction,
    jobId: string,
    action: ProductionJobLogAction,
    content: string,
    userId: string,
  ): Promise<void> {
    await tx.insert(productionJobLogs).values({
      jobId,
      action,
      // Phòng vượt varchar(1000) — Postgres throw thay vì tự cắt bớt.
      content: content.slice(0, 1000),
      performedBy: userId,
    });
  }

  private baseJobSelect() {
    return this.db
      .select({
        id: productionJobs.id,
        code: productionJobs.code,
        productionOrderCode: productionOrders.code,
        orderId: orders.id,
        orderCode: orders.code,
        dueDate: orders.dueDate,
        client: getTableColumns(clients),
        productId: products.id,
        productCode: products.code,
        productName: products.name,
        unit: getTableColumns(units),
        imageFile: getTableColumns(files),
        quantity: productionJobs.quantity,
        status: productionJobs.status,
        producedQty: productionJobs.producedQty,
        rejectedQty: productionJobs.rejectedQty,
        // Tính trong SQL, không derive lại trong JS mỗi dòng — cùng lý do `OrdersService.expiredSql`.
        remainingQty:
          sql<number>`${productionJobs.quantity} - ${productionJobs.producedQty} - ${productionJobs.rejectedQty}`
            .mapWith(Number)
            .as('remaining_qty'),
        startedAt: productionJobs.startedAt,
        completedAt: productionJobs.completedAt,
        approver: getTableColumns(credentials),
        approvedAt: productionOrders.approvedAt,
      })
      .from(productionJobs)
      .innerJoin(
        productionOrders,
        eq(productionOrders.id, productionJobs.productionOrderId),
      )
      .innerJoin(orders, eq(orders.id, productionOrders.orderId))
      .leftJoin(clients, eq(clients.id, orders.clientId))
      .innerJoin(products, eq(products.id, productionJobs.productId))
      .innerJoin(units, eq(units.id, products.unitId))
      .leftJoin(files, eq(files.id, products.imageFileId))
      .leftJoin(credentials, eq(credentials.id, productionOrders.approvedBy));
  }

  /** Khuôn `ProductionOrdersService.generateProductionOrderCode` — đếm toàn bảng `production_jobs`
   * (không lọc theo LSX) để cấp một dải mã liên tiếp cho cả lượt gọi, vẫn TOCTOU như mọi generator
   * khác trong repo, unique constraint trên `code` là chốt chặn thật. */
  private async generateJobCodes(
    tx: DbTransaction,
    howMany: number,
  ): Promise<string[]> {
    const [totalRows] = await tx
      .select({ total: count() })
      .from(productionJobs);
    const start = (totalRows?.total ?? 0) + 1;
    return Array.from(
      { length: howMany },
      (_, index) => `JOB${String(start + index).padStart(4, '0')}`,
    );
  }
}
