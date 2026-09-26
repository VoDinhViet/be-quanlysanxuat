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
  inArray,
  isNull,
  lte,
  ne,
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
  files,
  items,
  operations,
  OperationType,
  orders,
  productionJobBomItems,
  ProductionJobBomItemType,
  productionJobOperationReportFiles,
  productionJobOperationReports,
  productionJobOperations,
  productionJobs,
  ProductionJobStatus,
  productionOrders,
} from '../../database/schemas';
import { vnToday } from '../../database/vn-date.util';
import { AppException } from '../../exceptions/app.exception';
import type { JwtPayloadType } from '../auth/types/jwt-payload.type';
import { FilesService } from '../files/files.service';
import { OperationAccessService } from '../operations/operation-access.service';
import { ProductionJobsService } from '../production-jobs/production-jobs.service';
import { ProductionJobBomItemResDto } from '../production-jobs/dto/production-job-bom-operation.res.dto';
import { closeJobIfFinalAssemblyDone } from '../production-jobs/production-jobs.query';
import { CreateJobOperationReportReqDto } from './dto/create-job-operation-report.req.dto';
import { GetProductionExecutionJobsReqDto } from './dto/get-production-execution-jobs.req.dto';
import { GetProductionExecutionOperationsReqDto } from './dto/get-production-execution-operations.req.dto';
import { GetJobOperationReportsReqDto } from './dto/get-job-operation-reports.req.dto';
import { ProductionExecutionJobDetailResDto } from './dto/production-execution-job-detail.res.dto';
import { PageProductionExecutionJobResDto } from './dto/page-production-execution-job.res.dto';
import { ProductionExecutionOperationResDto } from './dto/production-execution-operation.res.dto';
import { ProductionExecutionReportResDto } from './dto/production-execution-report.res.dto';
import {
  JobOperationEvaluation,
  JobOperationProgress,
} from './production-execution.constant';

/** Màn "Thực hiện sản xuất" (view của tổ sản xuất, đi từ công đoạn xuống) — đọc snapshot đã có
 * sẵn từ `production-jobs`; header và cấu trúc công đoạn của Job ủy quyền `ProductionJobsService`
 * sau khi kiểm phạm vi công đoạn (`OperationAccessService`).
 * `createJobOperationReport` là đường ghi duy nhất vào `production_job_operations` — cộng dồn,
 * kèm nhật ký `production_job_operation_reports`. Xem
 * `docs/workflows/production-job-execution.md`, `docs/domains/production.md`. */
@Injectable()
export class ProductionExecutionService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly filesService: FilesService,
    private readonly operationAccess: OperationAccessService,
    private readonly productionJobsService: ProductionJobsService,
  ) {}

  /** Một dòng / công đoạn (`operations`, master data) có ít nhất 1 Job khớp bộ lọc — không gộp gì
   * theo `type`, `operationId` là id thật của `operations`. `type` trả về là giá trị danh mục
   * (`operations.type`, chỉ còn là gợi ý mặc định) — có thể khác `type` thật của từng dòng
   * `production_job_operations` bên dưới nếu nó đã được chọn khác lúc gắn vào BOM/routing
   * (`docs/decisions/routing-operation-type-per-attachment.md`); nhóm theo `operations.id` nên
   * không có cách hiện đúng type từng Job ở đây mà không đổi hẳn cách gộp. */
  async getOperations(
    reqDto: GetProductionExecutionOperationsReqDto,
    payload: JwtPayloadType,
  ): Promise<ProductionExecutionOperationResDto[]> {
    const allowedOperationIds =
      await this.operationAccess.getAllowedOperationIds(payload);
    if (allowedOperationIds?.length === 0) {
      return [];
    }

    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;
    const today = vnToday().toISOString().slice(0, 10);

    const rows = await this.db
      .select({
        operationId: operations.id,
        code: operations.code,
        name: operations.name,
        type: operations.type,
        jobCount: sql<number>`count(distinct ${productionJobs.id})`.mapWith(
          Number,
        ),
        inProgressCount:
          sql<number>`count(distinct ${productionJobs.id}) filter (where ${productionJobs.status} = ${ProductionJobStatus.IN_PROGRESS})`.mapWith(
            Number,
          ),
        overdueCount:
          sql<number>`count(distinct ${productionJobs.id}) filter (where ${productionJobOperations.completedDate} is null and ${productionJobOperations.dueDate} < ${today}::date)`.mapWith(
            Number,
          ),
      })
      .from(operations)
      .innerJoin(
        productionJobOperations,
        eq(productionJobOperations.operationId, operations.id),
      )
      .innerJoin(
        productionJobs,
        eq(productionJobs.id, productionJobOperations.productionJobId),
      )
      .innerJoin(
        productionOrders,
        eq(productionOrders.id, productionJobs.productionOrderId),
      )
      .innerJoin(orders, eq(orders.id, productionOrders.orderId))
      .innerJoin(items, eq(items.id, productionJobs.itemId))
      .where(
        and(
          allowedOperationIds
            ? inArray(operations.id, allowedOperationIds)
            : undefined,
          reqDto.status ? eq(productionJobs.status, reqDto.status) : undefined,
          reqDto.clientId ? eq(orders.clientId, reqDto.clientId) : undefined,
          reqDto.startDate ? gte(orders.dueDate, reqDto.startDate) : undefined,
          reqDto.endDate ? lte(orders.dueDate, reqDto.endDate) : undefined,
          keyword
            ? or(
                unaccentILike(productionJobs.code, keyword),
                unaccentILike(orders.code, keyword),
                unaccentILike(items.code, keyword),
                unaccentILike(items.name, keyword),
              )
            : undefined,
        ),
      )
      .groupBy(operations.id)
      .orderBy(asc(operations.code));

    return plainToInstance(ProductionExecutionOperationResDto, rows, {
      excludeExtraneousValues: true,
    });
  }

  /** `.select()` thủ công — `q`/`orderBy` chạm bảng join, cùng khuôn
   * `ProductionJobsService.getProductionJobs`. Gộp theo Job trên đúng các dòng
   * `production_job_operations` khớp `operationId`: hạn hoàn thành là `MAX(due_date)` qua mọi
   * Part, từ đó suy ra `operationStatus` (kể cả `OVERDUE`) và `operationEvaluation`. */
  async getJobs(
    reqDto: GetProductionExecutionJobsReqDto,
    payload: JwtPayloadType,
  ): Promise<OffsetPaginatedDto<PageProductionExecutionJobResDto>> {
    // Một công đoạn cụ thể: kiểm quyền vào đúng công đoạn đó. Không truyền = "Tất cả công đoạn" —
    // giới hạn trong các công đoạn người dùng được phép (null = không giới hạn, [] = không
    // được vào công đoạn nào), mỗi dòng là một cặp Job × công đoạn.
    let allowedOperationIds: string[] | null = null;
    if (reqDto.operationId) {
      await this.operationAccess.assertCanAccess(payload, reqDto.operationId);
    } else {
      allowedOperationIds =
        await this.operationAccess.getAllowedOperationIds(payload);
      if (allowedOperationIds?.length === 0) {
        return new OffsetPaginatedDto([], new OffsetPaginationDto(0, reqDto));
      }
    }

    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;
    const where = and(
      reqDto.operationId
        ? eq(productionJobOperations.operationId, reqDto.operationId)
        : allowedOperationIds
          ? inArray(productionJobOperations.operationId, allowedOperationIds)
          : undefined,
      reqDto.status ? eq(productionJobs.status, reqDto.status) : undefined,
      reqDto.clientId ? eq(orders.clientId, reqDto.clientId) : undefined,
      reqDto.startDate ? gte(orders.dueDate, reqDto.startDate) : undefined,
      reqDto.endDate ? lte(orders.dueDate, reqDto.endDate) : undefined,
      keyword
        ? or(
            unaccentILike(productionJobs.code, keyword),
            unaccentILike(orders.code, keyword),
            unaccentILike(items.code, keyword),
            unaccentILike(items.name, keyword),
          )
        : undefined,
    );

    const today = vnToday().toISOString().slice(0, 10);
    const completedQuantitySumExpr = sql`coalesce(sum(${productionJobOperations.completedQuantity}), 0)`;
    // Hạn / ngày xong của Job = muộn nhất qua các Part: công đoạn chỉ xong khi Part cuối xong.
    const operationDueDateExpr = sql<Date | null>`max(${productionJobOperations.dueDate})`;
    const operationCompletedDateExpr = sql`max(${productionJobOperations.completedDate})`;
    const isDoneExpr = sql`count(*) filter (where ${productionJobOperations.completedDate} is not null) = count(*)`;
    const operationStatusExpr = sql<JobOperationProgress>`
      case
        when ${isDoneExpr} then ${JobOperationProgress.DONE}
        when ${operationDueDateExpr} < ${today}::date then ${JobOperationProgress.OVERDUE}
        when ${completedQuantitySumExpr} > 0 or ${productionJobs.status} = ${ProductionJobStatus.IN_PROGRESS} then ${JobOperationProgress.IN_PROGRESS}
        else ${JobOperationProgress.NOT_STARTED}
      end
    `;
    const operationEvaluationExpr = sql<JobOperationEvaluation | null>`
      case
        when not ${isDoneExpr} or ${operationDueDateExpr} is null then null
        when ${operationCompletedDateExpr} <= ${operationDueDateExpr} then ${JobOperationEvaluation.ON_TIME}
        else ${JobOperationEvaluation.LATE}
      end
    `;

    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select({
          jobId: productionJobs.id,
          jobCode: productionJobs.code,
          operationId: operations.id,
          operationCode: operations.code,
          operationName: operations.name,
          orderCode: orders.code,
          item: getTableColumns(items),
          imageFile: getTableColumns(files),
          quantity: productionJobs.quantity,
          orderDate: orders.orderDate,
          dueDate: orders.dueDate,
          jobStatus: productionJobs.status,
          operationDueDate: operationDueDateExpr,
          operationStatus: operationStatusExpr,
          operationEvaluation: operationEvaluationExpr,
        })
        .from(productionJobs)
        .innerJoin(
          productionOrders,
          eq(productionOrders.id, productionJobs.productionOrderId),
        )
        .innerJoin(orders, eq(orders.id, productionOrders.orderId))
        .innerJoin(items, eq(items.id, productionJobs.itemId))
        .leftJoin(files, eq(files.id, items.imageFileId))
        .innerJoin(
          productionJobOperations,
          eq(productionJobOperations.productionJobId, productionJobs.id),
        )
        .innerJoin(
          operations,
          eq(operations.id, productionJobOperations.operationId),
        )
        .where(where)
        .groupBy(
          productionJobs.id,
          operations.id,
          orders.id,
          productionOrders.id,
          items.id,
          files.id,
        )
        .orderBy(desc(productionJobs.createdAt), desc(orders.createdAt))
        .limit(reqDto.limit)
        .offset(reqDto.offset),
      this.db
        .select({
          // Một dòng / (Job × công đoạn) — đúng bằng số nhóm của câu SELECT phía trên.
          total:
            sql<number>`count(distinct (${productionJobs.id}, ${productionJobOperations.operationId}))`.mapWith(
              Number,
            ),
        })
        .from(productionJobs)
        .innerJoin(
          productionOrders,
          eq(productionOrders.id, productionJobs.productionOrderId),
        )
        .innerJoin(orders, eq(orders.id, productionOrders.orderId))
        .innerJoin(items, eq(items.id, productionJobs.itemId))
        .innerJoin(
          productionJobOperations,
          eq(productionJobOperations.productionJobId, productionJobs.id),
        )
        .where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(PageProductionExecutionJobResDto, rows, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(total, reqDto),
    );
  }

  /** Header của Job cho màn "Thực hiện sản xuất" — chỉ khi Job có công đoạn `operationId` và người
   * dùng được phép làm việc ở công đoạn đó. */
  async getJob(
    productionJobId: string,
    operationId: string,
    payload: JwtPayloadType,
  ): Promise<ProductionExecutionJobDetailResDto> {
    await this.operationAccess.assertCanAccess(payload, operationId);
    await this.ensureJobHasOperation(productionJobId, operationId);

    const detail =
      await this.productionJobsService.getProductionJob(productionJobId);
    const [item] = await this.db
      .select({ imageFile: getTableColumns(files) })
      .from(items)
      .leftJoin(files, eq(files.id, items.imageFileId))
      .where(eq(items.id, detail.itemId))
      .limit(1);

    return plainToInstance(
      ProductionExecutionJobDetailResDto,
      { ...detail, imageFile: item?.imageFile?.id ? item.imageFile : null },
      { excludeExtraneousValues: true },
    );
  }

  /** Part → công đoạn của Job, đã lọc theo công đoạn `operationId` được phép. */
  async getJobOperations(
    productionJobId: string,
    operationId: string,
    payload: JwtPayloadType,
  ): Promise<ProductionJobBomItemResDto[]> {
    await this.operationAccess.assertCanAccess(payload, operationId);
    await this.ensureJobHasOperation(productionJobId, operationId);

    return this.productionJobsService.getProductionJobOperations(
      productionJobId,
      operationId,
    );
  }

  private async ensureJobHasOperation(
    productionJobId: string,
    operationId: string,
  ): Promise<void> {
    const [existing] = await this.db
      .select({ id: productionJobOperations.id })
      .from(productionJobOperations)
      .where(
        and(
          eq(productionJobOperations.productionJobId, productionJobId),
          eq(productionJobOperations.operationId, operationId),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new AppException(ErrorCode.E091, HttpStatus.NOT_FOUND);
    }
  }

  /** Lịch sử báo cáo sản lượng của một Job (lọc theo công đoạn tuỳ chọn), mỗi lần báo cáo một
   * dòng, mới nhất trước, phân trang. */
  async getJobOperationReports(
    productionJobId: string,
    reqDto: GetJobOperationReportsReqDto,
    payload: JwtPayloadType,
  ): Promise<OffsetPaginatedDto<ProductionExecutionReportResDto>> {
    const allowedOperationIds =
      await this.operationAccess.getAllowedOperationIds(payload);
    if (reqDto.operationId) {
      this.operationAccess.assertOperationAllowed(
        allowedOperationIds,
        reqDto.operationId,
      );
    }

    const where = and(
      eq(productionJobOperations.productionJobId, productionJobId),
      allowedOperationIds
        ? inArray(productionJobOperations.operationId, allowedOperationIds)
        : undefined,
      reqDto.jobOperationId
        ? eq(productionJobOperations.id, reqDto.jobOperationId)
        : undefined,
      reqDto.operationId
        ? eq(productionJobOperations.operationId, reqDto.operationId)
        : undefined,
      reqDto.bomItemId
        ? eq(productionJobOperations.productionJobBomItemId, reqDto.bomItemId)
        : undefined,
    );

    const reportWhere = inArray(
      productionJobOperationReports.productionJobOperationId,
      this.db
        .select({ id: productionJobOperations.id })
        .from(productionJobOperations)
        .where(where),
    );

    const [reports, [{ total }]] = await Promise.all([
      this.db.query.productionJobOperationReports.findMany({
        where: reportWhere,
        with: {
          creatorBy: { columns: { id: true, code: true, fullName: true } },
          files: { with: { file: true } },
          productionJobOperation: { with: { bomItem: true } },
        },
        orderBy: desc(productionJobOperationReports.createdAt),
        limit: reqDto.limit,
        offset: reqDto.offset,
      }),
      this.db
        .select({ total: count() })
        .from(productionJobOperationReports)
        .where(reportWhere),
    ]);

    const data = reports.map((report) =>
      plainToInstance(
        ProductionExecutionReportResDto,
        {
          ...report,
          operation: report.productionJobOperation,
          bomItem: report.productionJobOperation.bomItem,
          creator: report.creatorBy,
          files: report.files.map(({ file }) => file),
        },
        { excludeExtraneousValues: true },
      ),
    );

    return new OffsetPaginatedDto(data, new OffsetPaginationDto(total, reqDto));
  }

  /** `POST .../operations/:jobOperationId/reports` — đường ghi duy nhất vào
   * `production_job_operations`, cộng dồn (không ghi đè). Xem `docs/workflows/production-job-execution.md`. */
  async createJobOperationReport(
    jobOperationId: string,
    reqDto: CreateJobOperationReportReqDto,
    payload: JwtPayloadType,
  ): Promise<void> {
    const operation = await this.db.query.productionJobOperations.findFirst({
      where: eq(productionJobOperations.id, jobOperationId),
      with: { bomItem: true, productionJob: true },
    });

    if (!operation) {
      throw new AppException(ErrorCode.E091, HttpStatus.NOT_FOUND);
    }

    await this.operationAccess.assertCanAccess(payload, operation.operationId);

    // completedQuantity/completedDate của công đoạn OUTSOURCE chỉ do OS-IN ghi
    // (`recomputeOutsourcedOperationProgress`) — không cho báo cáo tay,
    // `docs/decisions/outsourced-operation-progress-writeback.md`.
    if (operation.type === OperationType.OUTSOURCE) {
      throw new AppException(ErrorCode.E260, HttpStatus.CONFLICT);
    }

    if (operation.productionJob.status !== ProductionJobStatus.IN_PROGRESS) {
      throw new AppException(ErrorCode.E087, HttpStatus.CONFLICT);
    }

    const rejectedQuantityDelta = reqDto.rejectedQuantityDelta ?? 0;

    if (reqDto.completedQuantityDelta === 0 && rejectedQuantityDelta === 0) {
      throw new AppException(
        ErrorCode.E256,
        HttpStatus.BAD_REQUEST,
        'Vui lòng nhập SL đạt hoặc SL không đạt lớn hơn 0.',
      );
    }

    // Bước Lắp ráp (node `itemType = 'FG'`) chỉ mở khi mọi Part khác của Job đã báo hoàn thành đủ
    // (`E210`).
    if (operation.bomItem.itemType === ProductionJobBomItemType.FG) {
      const pendingCount = await this.countPendingOperations(
        this.db,
        operation.productionJobId,
        false,
      );

      if (pendingCount > 0) {
        throw new AppException(ErrorCode.E210, HttpStatus.BAD_REQUEST);
      }
    }

    if (reqDto.imageFileIds?.length) {
      await this.filesService.linkFiles(reqDto.imageFileIds);
    }

    const plannedQuantity = operation.bomItem.plannedQuantity;

    await this.db.transaction(async (tx) => {
      const lockedOperation = await this.getProductionJobOperationForUpdate(
        tx,
        jobOperationId,
      );

      const newCompletedQuantity =
        lockedOperation.completedQuantity + reqDto.completedQuantityDelta;
      const newRejectedQuantity =
        lockedOperation.rejectedQuantity + rejectedQuantityDelta;

      // Chỉ trần SL đạt — SL NG cộng dồn không giới hạn theo plannedQuantity, cho phép báo bù thêm
      // tới khi đạt chạm đủ kế hoạch (BUG-035, trần cũ gộp cả hai số làm công đoạn kẹt vĩnh viễn).
      const roundedNewCompleted =
        Math.round(newCompletedQuantity * 1000) / 1000;
      const roundedPlanned = Math.round(plannedQuantity * 1000) / 1000;

      if (roundedNewCompleted > roundedPlanned) {
        throw new AppException(
          ErrorCode.E256,
          HttpStatus.BAD_REQUEST,
          'SL hoàn thành không được vượt quá SL kế hoạch.',
        );
      }

      const [report] = await tx
        .insert(productionJobOperationReports)
        .values({
          productionJobOperationId: jobOperationId,
          completedQuantityDelta: reqDto.completedQuantityDelta,
          rejectedQuantityDelta,
          completedDate: vnToday(),
          note: reqDto.note,
          createdBy: payload.userId,
        })
        .returning({ id: productionJobOperationReports.id });

      if (reqDto.imageFileIds?.length) {
        await tx.insert(productionJobOperationReportFiles).values(
          reqDto.imageFileIds.map((fileId) => ({
            reportId: report.id,
            fileId,
          })),
        );
      }

      await tx
        .update(productionJobOperations)
        .set({
          completedQuantity: newCompletedQuantity,
          rejectedQuantity: newRejectedQuantity,
          lastReportedAt: new Date(),
          completedDate:
            roundedNewCompleted >= roundedPlanned ? vnToday() : null,
        })
        .where(eq(productionJobOperations.id, jobOperationId));

      // Node FG có thể có nhiều công đoạn Cấp 0 — chỉ chuyển WAITING_QC khi KHÔNG CÒN công đoạn FG
      // nào dở, đếm lại trong `tx` sau khi ghi (BUG-079, `docs/decisions/production-lifecycle-closing.md`).
      if (operation.bomItem.itemType === ProductionJobBomItemType.FG) {
        await closeJobIfFinalAssemblyDone(tx, operation.productionJobId);
      }
    });
  }

  /** Đếm công đoạn của Job chưa `completedDate`, lọc theo phía node BOM (FG hay không) — dùng cho
   * cả gate `E210` (đếm phía non-FG, trước khi mở bước Lắp ráp) lẫn recount trong `tx` (đếm phía FG,
   * quyết định `WAITING_QC`), cùng khuôn "đếm lại trong `tx`" của `ProductionJobsService`. */
  private async countPendingOperations(
    executor: Database | DbTransaction,
    jobId: string,
    isFinalAssembly: boolean,
  ): Promise<number> {
    const [{ total }] = await executor
      .select({ total: count() })
      .from(productionJobOperations)
      .innerJoin(
        productionJobBomItems,
        eq(
          productionJobBomItems.id,
          productionJobOperations.productionJobBomItemId,
        ),
      )
      .where(
        and(
          eq(productionJobOperations.productionJobId, jobId),
          isFinalAssembly
            ? eq(productionJobBomItems.itemType, ProductionJobBomItemType.FG)
            : ne(productionJobBomItems.itemType, ProductionJobBomItemType.FG),
          isNull(productionJobOperations.completedDate),
        ),
      );

    return total;
  }

  private async getProductionJobOperationForUpdate(
    tx: DbTransaction,
    jobOperationId: string,
  ) {
    const [operation] = await tx
      .select()
      .from(productionJobOperations)
      .where(eq(productionJobOperations.id, jobOperationId))
      .for('update');

    if (!operation) {
      throw new AppException(ErrorCode.E091, HttpStatus.NOT_FOUND);
    }

    return operation;
  }
}
