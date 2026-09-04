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
  items,
  ItemType,
  operations,
  OperationType,
  orders,
  productionJobBomItems,
  productionJobOperationReportFiles,
  productionJobOperationReports,
  productionJobOperations,
  productionJobs,
  ProductionJobStatus,
  productionOrders,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { FilesService } from '../files/files.service';
import { closeJobIfFinalAssemblyDone } from '../production-jobs/production-jobs.query';
import { CreateJobOperationReportReqDto } from './dto/create-job-operation-report.req.dto';
import { GetProductionExecutionJobsReqDto } from './dto/get-production-execution-jobs.req.dto';
import { GetProductionExecutionOperationsReqDto } from './dto/get-production-execution-operations.req.dto';
import { PageProductionExecutionJobResDto } from './dto/page-production-execution-job.res.dto';
import { ProductionExecutionOperationResDto } from './dto/production-execution-operation.res.dto';
import { JobOperationProgress } from './production-execution.constant';

/** Màn "Thực hiện sản xuất" (view của tổ sản xuất, đi từ công đoạn xuống) — đọc thuần snapshot đã
 * có sẵn từ `production-jobs` (không import module đó, không gọi service nào của nó).
 * `createJobOperationReport` là đường ghi duy nhất vào `production_job_operations` — cộng dồn,
 * kèm nhật ký `production_job_operation_reports`. Xem
 * `docs/workflows/production-job-execution.md`, `docs/domains/production.md`. */
@Injectable()
export class ProductionExecutionService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly filesService: FilesService,
  ) {}

  /** Một dòng / công đoạn (`operations`, master data) có ít nhất 1 Job khớp bộ lọc — không gộp gì
   * theo `type`, `operationId` là id thật của `operations`. */
  async getOperations(
    reqDto: GetProductionExecutionOperationsReqDto,
  ): Promise<ProductionExecutionOperationResDto[]> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;

    const rows = await this.db
      .select({
        operationId: operations.id,
        code: operations.code,
        name: operations.name,
        type: operations.type,
        jobCount: sql<number>`count(distinct ${productionJobs.id})`.mapWith(
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
   * `production_job_operations` khớp `operationId`, `plannedQuantity`/`completedQuantity`/
   * `rejectedQuantity` là `SUM` qua mọi Part của Job có công đoạn đó. */
  async getJobs(
    reqDto: GetProductionExecutionJobsReqDto,
  ): Promise<OffsetPaginatedDto<PageProductionExecutionJobResDto>> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;
    const where = and(
      eq(productionJobOperations.operationId, reqDto.operationId),
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

    const completedOpsExpr = sql`count(*) filter (where ${productionJobOperations.completedDate} is not null)`;
    const totalOpsExpr = sql`count(*)`;
    const completedQuantitySumExpr = sql`coalesce(sum(${productionJobOperations.completedQuantity}), 0)`;
    const operationStatusExpr = sql<JobOperationProgress>`
      case
        when ${completedOpsExpr} = ${totalOpsExpr} then ${JobOperationProgress.DONE}
        when ${completedQuantitySumExpr} > 0 then ${JobOperationProgress.IN_PROGRESS}
        else ${JobOperationProgress.NOT_STARTED}
      end
    `;
    const operationCompletedDateExpr = sql<Date | null>`
      case when ${completedOpsExpr} = ${totalOpsExpr}
        then max(${productionJobOperations.completedDate})
        else null
      end
    `;

    const [rows, countRows] = await Promise.all([
      this.db
        .select({
          jobId: productionJobs.id,
          jobCode: productionJobs.code,
          orderCode: orders.code,
          item: getTableColumns(items),
          quantity: productionJobs.quantity,
          orderDate: orders.orderDate,
          dueDate: orders.dueDate,
          jobStatus: productionJobs.status,
          plannedQuantity:
            sql<number>`coalesce(sum(${productionJobBomItems.plannedQuantity}), 0)`.mapWith(
              Number,
            ),
          completedQuantity: completedQuantitySumExpr.mapWith(Number),
          rejectedQuantity:
            sql<number>`coalesce(sum(${productionJobOperations.rejectedQuantity}), 0)`.mapWith(
              Number,
            ),
          operationCompletedDate: operationCompletedDateExpr,
          operationStatus: operationStatusExpr,
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
        .innerJoin(
          productionJobBomItems,
          eq(
            productionJobBomItems.id,
            productionJobOperations.productionJobBomItemId,
          ),
        )
        .where(where)
        .groupBy(productionJobs.id, orders.id, productionOrders.id, items.id)
        .orderBy(asc(orders.dueDate), desc(productionOrders.approvedAt))
        .limit(reqDto.limit)
        .offset(reqDto.offset),
      this.db
        .select({
          total: sql<number>`count(distinct ${productionJobs.id})`.mapWith(
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
      new OffsetPaginationDto(countRows[0]?.total ?? 0, reqDto),
    );
  }

  /** `POST .../operations/:jobOperationId/reports` — đường ghi duy nhất vào
   * `production_job_operations`, cộng dồn (không ghi đè). Xem `docs/workflows/production-job-execution.md`. */
  async createJobOperationReport(
    jobOperationId: string,
    reqDto: CreateJobOperationReportReqDto,
    userId: string,
  ): Promise<void> {
    const operation = await this.db.query.productionJobOperations.findFirst({
      where: eq(productionJobOperations.id, jobOperationId),
      with: { bomItem: true, productionJob: true },
    });

    if (!operation) {
      throw new AppException(ErrorCode.E091, HttpStatus.NOT_FOUND);
    }

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

    // Bước Lắp ráp (node `itemType = 'FG'`) chỉ mở khi mọi Part khác của Job đã báo hoàn thành đủ
    // (`E210`).
    if (operation.bomItem.itemType === ItemType.FG) {
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
      if (newCompletedQuantity > plannedQuantity) {
        throw new AppException(ErrorCode.E256, HttpStatus.BAD_REQUEST);
      }

      const [report] = await tx
        .insert(productionJobOperationReports)
        .values({
          productionJobOperationId: jobOperationId,
          completedQuantityDelta: reqDto.completedQuantityDelta,
          rejectedQuantityDelta,
          completedDate: reqDto.completedDate,
          note: reqDto.note,
          createdBy: userId,
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
          completedDate:
            newCompletedQuantity >= plannedQuantity
              ? reqDto.completedDate
              : null,
        })
        .where(eq(productionJobOperations.id, jobOperationId));

      // Node FG có thể có nhiều công đoạn Cấp 0 — chỉ chuyển WAITING_QC khi KHÔNG CÒN công đoạn FG
      // nào dở, đếm lại trong `tx` sau khi ghi (BUG-079, `docs/decisions/production-lifecycle-closing.md`).
      if (operation.bomItem.itemType === ItemType.FG) {
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
            ? eq(productionJobBomItems.itemType, ItemType.FG)
            : ne(productionJobBomItems.itemType, ItemType.FG),
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
