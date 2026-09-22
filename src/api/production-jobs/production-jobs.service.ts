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
  lte,
  or,
  sql,
} from 'drizzle-orm';

import { OffsetPaginationDto } from '../../common/dto/offset-pagination/offset-pagination.dto';
import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import {
  DocumentType,
  generateDocumentSequences,
} from '../../common/utils/document-sequence.util';
import { unaccentILike } from '../../common/utils/search.util';
import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import type { Database, DbTransaction } from '../../database/database.type';
import {
  clients,
  files,
  items,
  orders,
  productionJobBomItems,
  productionJobIssues,
  productionJobItems,
  ProductionJobLogAction,
  productionJobLogs,
  productionJobNotes,
  productionJobOperations,
  productionJobs,
  ProductionJobStatus,
  productionJobUnits,
  productionOrders,
  qualityInspections,
  units,
  QualityInspectionType,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { issuedQuantityByJobItemSubquery } from '../inventory-requisitions/inventory-requisitions.query';
import { InventoryService } from '../inventory/inventory.service';
import { PurchaseRequestsService } from '../purchase-requests/purchase-requests.service';
import { PurchaseRequestShortageItem } from '../purchase-requests/types/shortage-request.type';
import { UsersService } from '../users/users.service';
import { CreateProductionJobNoteReqDto } from './dto/create-production-job-note.req.dto';
import { GetProductionJobBomReqDto } from './dto/get-production-job-bom.req.dto';
import { GetProductionJobLogsReqDto } from './dto/get-production-job-logs.req.dto';
import { GetProductionJobNotesReqDto } from './dto/get-production-job-notes.req.dto';
import { GetProductionJobsReqDto } from './dto/get-production-jobs.req.dto';
import { ProductionJobBomItemResDto } from './dto/production-job-bom-operation.res.dto';
import { ProductionJobDetailResDto } from './dto/production-job-detail.res.dto';
import { ProductionJobIssueResDto } from './dto/production-job-issue.res.dto';
import { ProductionJobLogResDto } from './dto/production-job-log.res.dto';
import { ProductionJobNoteResDto } from './dto/production-job-note.res.dto';
import { ProductionJobResDto } from './dto/production-job.res.dto';
import { UpdateProductionJobOperationDueDateReqDto } from './dto/update-production-job-operation-due-date.req.dto';
import { createJobSnapshot } from './production-job-snapshot.query';

/** Job sản xuất — 1 sản phẩm (FG) = 1 Job trong một LSX. Chỉ tạo được qua `createJobs`, gọi từ
 * transaction duyệt LSX (`ProductionOrdersService.approveProductionOrder`) — không có route tạo
 * Job riêng. Job `PENDING` chưa có snapshot nào — `start` là nơi DUY NHẤT gọi `createJobSnapshot`,
 * dựng cây BOM/công đoạn/vật tư từ master data hiện tại rồi đóng băng vĩnh viễn ngay từ đó, xem
 * `docs/decisions/job-snapshot-at-start.md`. Vòng đời, business rule:
 * `docs/domains/production.md`, `docs/workflows/production-job-execution.md`. */
@Injectable()
export class ProductionJobsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly inventoryService: InventoryService,
    private readonly purchaseRequestsService: PurchaseRequestsService,
    private readonly usersService: UsersService,
  ) {}

  /** `.select()` thủ công — `q` lọc trên `productionOrders`/`orders`/`items` (bảng join),
   * relational query API không biểu diễn được. */
  async getProductionJobs(
    reqDto: GetProductionJobsReqDto,
  ): Promise<OffsetPaginatedDto<ProductionJobResDto>> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;
    const where = and(
      reqDto.orderId ? eq(orders.id, reqDto.orderId) : undefined,
      reqDto.itemId ? eq(productionJobs.itemId, reqDto.itemId) : undefined,
      reqDto.statuses?.length
        ? inArray(productionJobs.status, reqDto.statuses)
        : reqDto.status
          ? eq(productionJobs.status, reqDto.status)
          : undefined,
      reqDto.clientId ? eq(orders.clientId, reqDto.clientId) : undefined,
      reqDto.startDate ? gte(orders.dueDate, reqDto.startDate) : undefined,
      reqDto.endDate ? lte(orders.dueDate, reqDto.endDate) : undefined,
      keyword
        ? or(
            unaccentILike(productionJobs.code, keyword),
            unaccentILike(productionOrders.code, keyword),
            unaccentILike(orders.code, keyword),
            unaccentILike(items.code, keyword),
            unaccentILike(items.name, keyword),
          )
        : undefined,
    );

    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select({
          id: productionJobs.id,
          code: productionJobs.code,
          orderCode: orders.code,
          client: getTableColumns(clients),
          imageFile: getTableColumns(files),
          quantity: productionJobs.quantity,
          orderDate: orders.orderDate,
          dueDate: orders.dueDate,
          status: productionJobs.status,
        })
        .from(productionJobs)
        .innerJoin(
          productionOrders,
          eq(productionOrders.id, productionJobs.productionOrderId),
        )
        .innerJoin(orders, eq(orders.id, productionOrders.orderId))
        .leftJoin(clients, eq(clients.id, orders.clientId))
        .innerJoin(items, eq(items.id, productionJobs.itemId))
        .leftJoin(files, eq(files.id, items.imageFileId))
        .where(where)
        .orderBy(desc(productionJobs.createdAt), desc(orders.createdAt))
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
        .innerJoin(items, eq(items.id, productionJobs.itemId))
        .where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(ProductionJobResDto, rows, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(total, reqDto),
    );
  }

  async getProductionJob(jobId: string): Promise<ProductionJobDetailResDto> {
    const [job] = await this.db
      .select({
        id: productionJobs.id,
        code: productionJobs.code,
        productionOrderId: productionJobs.productionOrderId,
        order: getTableColumns(orders),
        client: getTableColumns(clients),
        itemId: productionJobs.itemId,
        quantity: productionJobs.quantity,
        status: productionJobs.status,
        startedBy: productionJobs.startedBy,
        startedAt: productionJobs.startedAt,
        operationsApprovedBy: productionJobs.operationsApprovedBy,
        operationsApprovedAt: productionJobs.operationsApprovedAt,
        createdAt: productionJobs.createdAt,
        updatedAt: productionJobs.updatedAt,
        item: getTableColumns(items),
        unit: getTableColumns(units),
      })
      .from(productionJobs)
      .innerJoin(
        productionOrders,
        eq(productionOrders.id, productionJobs.productionOrderId),
      )
      .innerJoin(orders, eq(orders.id, productionOrders.orderId))
      .leftJoin(clients, eq(clients.id, orders.clientId))
      .innerJoin(items, eq(items.id, productionJobs.itemId))
      .leftJoin(units, eq(units.id, items.unitId))
      .where(eq(productionJobs.id, jobId));

    if (!job) {
      throw new AppException(ErrorCode.E082, HttpStatus.NOT_FOUND);
    }

    const [oqcRequest] = await this.db
      .select({ id: qualityInspections.id })
      .from(qualityInspections)
      .where(
        and(
          eq(qualityInspections.productionJobId, jobId),
          eq(qualityInspections.inspectionType, QualityInspectionType.OQC),
        ),
      )
      .limit(1);

    return plainToInstance(
      ProductionJobDetailResDto,
      { ...job, oqcRequested: !!oqcRequest },
      { excludeExtraneousValues: true },
    );
  }

  /** `GET /production-jobs/:jobId/bom` — nhu cầu vật tư của Job. Đọc `production_job_issues`
   * (1 dòng/vật tư, `requiredQty` = định mức BOM × SL Job, ghi đúng 1 lần lúc `start` — Job còn
   * `PENDING` trả mảng rỗng, xem `docs/decisions/job-snapshot-at-start.md`) join hai bảng chiều
   * `productionJobItems`/`productionJobUnits`, trả nguyên cả hai qua `getTableColumns` lồng dưới
   * `item`/`unit` — `code`/`name` trùng tên giữa hai bảng nên không spread phẳng được, và DTO
   * (`@Expose()` trên `ProductionJobItemResDto`/`ProductionJobUnitResDto`) tự lọc chỉ còn
   * `code`/`name`. `.select()` thủ công vì `q` lẫn `orderBy` chạm bảng join — relational query API
   * không biểu diễn được. Hai `innerJoin` an toàn vì cả hai FK đều `NOT NULL` (quan hệ 1-1, không
   * rơi dòng nào, `count()` khớp đúng trang). */
  async getProductionJobBom(
    jobId: string,
    reqDto: GetProductionJobBomReqDto,
  ): Promise<OffsetPaginatedDto<ProductionJobIssueResDto>> {
    await this.ensureJobExists(jobId);

    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;
    const where = and(
      eq(productionJobIssues.productionJobId, jobId),
      keyword
        ? or(
            unaccentILike(productionJobItems.code, keyword),
            unaccentILike(productionJobItems.name, keyword),
          )
        : undefined,
    );

    // "Theo dõi đã lãnh" — Đã lãnh đọc qua hàm thuần của module `inventory-requisitions`
    // (`docs/domains/inventory.md`), không qua DI, cùng tiền lệ `hasPendingIqcForItems`.
    const issued = issuedQuantityByJobItemSubquery(this.db);

    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select({
          item: getTableColumns(productionJobItems),
          unit: getTableColumns(productionJobUnits),
          requiredQty: productionJobIssues.requiredQty,
          issuedQuantity:
            sql<number>`coalesce(${issued.issuedQuantity}, 0)`.mapWith(Number),
        })
        .from(productionJobIssues)
        .innerJoin(
          productionJobItems,
          eq(productionJobItems.id, productionJobIssues.productionJobItemId),
        )
        .innerJoin(
          productionJobUnits,
          eq(productionJobUnits.id, productionJobIssues.productionJobUnitId),
        )
        .leftJoin(
          issued,
          and(
            eq(issued.productionJobId, jobId),
            eq(issued.itemId, productionJobIssues.itemId),
          ),
        )
        .where(where)
        .orderBy(asc(productionJobItems.code), asc(productionJobIssues.id))
        .limit(reqDto.limit)
        .offset(reqDto.offset),
      this.db
        .select({ total: count() })
        .from(productionJobIssues)
        .innerJoin(
          productionJobItems,
          eq(productionJobItems.id, productionJobIssues.productionJobItemId),
        )
        .where(where),
    ]);

    const lines = rows.map((row) => ({
      ...row,
      remainingQuantity: Math.max(row.requiredQty - row.issuedQuantity, 0),
    }));

    return new OffsetPaginatedDto(
      plainToInstance(ProductionJobIssueResDto, lines, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(total, reqDto),
    );
  }

  /** `GET /production-jobs/:jobId/operations` — công đoạn as-used của Job (cả `INHOUSE` lẫn
   * `OUTSOURCE`), nhóm theo BOM item chứa nó; nguồn duy nhất để lấy id công đoạn
   * (`production_job_operations.id`) cho `POST
   * /production-execution/operations/:jobOperationId/reports`. `plannedQuantity` đọc thẳng cột đã
   * đóng băng lúc `start` (`production-job-snapshot.query.ts`, xem
   * `docs/decisions/job-snapshot-at-start.md` — Job còn `PENDING` trả mảng rỗng), gắn xuống từng
   * công đoạn của node. `operationId` optional lọc chỉ trả BOM item nào chứa đúng công đoạn đó —
   * dùng bởi "Thực hiện sản xuất" (`ProductionExecutionService` đọc qua route này, không có route
   * riêng). Mảng thường, không phân trang — số BOM item của một Job luôn nhỏ. */
  async getProductionJobOperations(
    jobId: string,
    operationId?: string,
  ): Promise<ProductionJobBomItemResDto[]> {
    await this.ensureJobExists(jobId);

    const bomItems = await this.db.query.productionJobBomItems.findMany({
      where: eq(productionJobBomItems.productionJobId, jobId),
      orderBy: [
        asc(productionJobBomItems.sortOrder),
        asc(productionJobBomItems.id),
      ],
      with: {
        operations: {
          where: operationId
            ? eq(productionJobOperations.operationId, operationId)
            : undefined,
          orderBy: [
            asc(productionJobOperations.sortOrder),
            asc(productionJobOperations.createdAt),
          ],
        },
      },
    });

    const groups = bomItems
      .filter((bomItem) => bomItem.operations.length > 0)
      .map((bomItem) => ({
        ...bomItem,
        operations: bomItem.operations.map((operation) => ({
          ...operation,
          plannedQuantity: bomItem.plannedQuantity,
        })),
      }));

    return plainToInstance(ProductionJobBomItemResDto, groups, {
      excludeExtraneousValues: true,
    });
  }

  async createProductionJobNote(
    jobId: string,
    reqDto: CreateProductionJobNoteReqDto,
    userId: string,
  ): Promise<void> {
    await this.ensureJobExists(jobId);

    await this.db.insert(productionJobNotes).values({
      productionJobId: jobId,
      content: reqDto.content,
      createdBy: userId,
    });
  }

  /** Đặt/sửa hạn công đoạn — cột kế hoạch duy nhất sửa được trên snapshot đã đóng băng; không
   * chạm tiến độ (`completedQuantity`/`completedDate` vẫn chỉ đi qua `POST .../reports`). Cho
   * phép cả công đoạn OUTSOURCE (khác `createJobOperationReport` chặn E260) — hạn là kế hoạch,
   * không phải số liệu tự ghi từ OS-IN. */
  async updateProductionJobOperationDueDate(
    jobId: string,
    jobOperationId: string,
    reqDto: UpdateProductionJobOperationDueDateReqDto,
  ): Promise<void> {
    const job = await this.ensureJobExists(jobId);

    this.ensureStatus(job.status, [ProductionJobStatus.IN_PROGRESS]);

    const result = await this.db
      .update(productionJobOperations)
      .set({ dueDate: reqDto.dueDate })
      .where(
        and(
          eq(productionJobOperations.id, jobOperationId),
          eq(productionJobOperations.productionJobId, jobId),
        ),
      )
      .returning({ id: productionJobOperations.id });

    if (result.length === 0) {
      throw new AppException(ErrorCode.E091, HttpStatus.NOT_FOUND);
    }
  }

  /** Sắp `asc(createdAt)` — đọc xuôi như luồng trao đổi, khác `getProductionOrderLogs` (đọc ngược
   * lịch sử) một cách có chủ đích. */
  async getProductionJobNotes(
    jobId: string,
    reqDto: GetProductionJobNotesReqDto,
  ): Promise<OffsetPaginatedDto<ProductionJobNoteResDto>> {
    await this.ensureJobExists(jobId);

    const where = eq(productionJobNotes.productionJobId, jobId);
    const [rows, [{ total }]] = await Promise.all([
      this.db.query.productionJobNotes.findMany({
        where,
        with: { creatorBy: true },
        orderBy: asc(productionJobNotes.createdAt),
        limit: reqDto.limit,
        offset: reqDto.offset,
      }),
      this.db.select({ total: count() }).from(productionJobNotes).where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(ProductionJobNoteResDto, rows, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(total, reqDto),
    );
  }

  async getProductionJobLogs(
    jobId: string,
    reqDto: GetProductionJobLogsReqDto,
  ): Promise<OffsetPaginatedDto<ProductionJobLogResDto>> {
    await this.ensureJobExists(jobId);

    const where = eq(productionJobLogs.productionJobId, jobId);
    const [rows, [{ total }]] = await Promise.all([
      this.db.query.productionJobLogs.findMany({
        where,
        with: { performerBy: true },
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
      new OffsetPaginationDto(total, reqDto),
    );
  }

  /** Sinh Job cho một LSX vừa duyệt — 1 Job/item FG (SL > 0), gộp mọi dòng
   * `production_order_items` cùng `itemId`. Bắt buộc truyền `tx` — chỉ gọi được từ transaction
   * duyệt của `ProductionOrdersService.approveProductionOrder`. Chỉ sinh header `production_jobs`
   * (`PENDING`) — KHÔNG snapshot gì cả; `startJob` mới là nơi dựng cây BOM/công đoạn/vật tư, xem
   * `docs/decisions/job-snapshot-at-start.md`. */
  async createJobs(
    tx: DbTransaction,
    productionOrderId: string,
    quantityByItem: Map<string, number>,
    userId: string,
  ): Promise<void> {
    if (!quantityByItem.size) {
      return;
    }

    const itemIds = [...quantityByItem.keys()];
    const codes = await this.generateJobCodes(tx, itemIds.length);
    const jobRows = await tx
      .insert(productionJobs)
      .values(
        itemIds.map((itemId, index) => ({
          code: codes[index],
          productionOrderId,
          itemId,
          quantity: quantityByItem.get(itemId)!,
        })),
      )
      .returning({
        id: productionJobs.id,
        itemId: productionJobs.itemId,
      });

    await tx.insert(productionJobLogs).values(
      jobRows.map((job) => ({
        productionJobId: job.id,
        action: ProductionJobLogAction.CREATED,
        content: `Tạo Job từ LSX đã duyệt (SL kế hoạch ${quantityByItem.get(job.itemId)!})`,
        performedBy: userId,
      })),
    );
  }

  /** `PENDING` → `IN_PROGRESS` (`E087` nếu không), ghi `startedBy`/`startedAt`. `createJobSnapshot`
   * ở đây là lần **duy nhất** Job có snapshot — dựng từ BOM/công đoạn/vật tư của sản phẩm ngay lúc
   * bấm, rồi đóng băng vĩnh viễn (`docs/decisions/job-snapshot-at-start.md`). Cùng transaction: vật
   * tư nào của Job thiếu tồn thì sinh một đề xuất mua hàng cho đúng phần thiếu
   * (`PurchaseRequestsService.createShortageRequest`) — không thiếu gì thì không tạo phiếu.
   * Trình tự đầy đủ: `docs/workflows/production-job-execution.md`. */
  async startJob(jobId: string, userId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const job = await this.getProductionJobForUpdate(tx, jobId);
      this.ensureStatus(job.status, [ProductionJobStatus.PENDING]);

      await createJobSnapshot(tx, job);

      const jobIssueShortages = await this.collectJobIssueShortages(tx, jobId);

      await tx
        .update(productionJobs)
        .set({
          status: ProductionJobStatus.IN_PROGRESS,
          startedBy: userId,
          startedAt: new Date(),
        })
        .where(eq(productionJobs.id, jobId));

      await tx.insert(productionJobLogs).values({
        productionJobId: jobId,
        action: ProductionJobLogAction.STARTED,
        content: jobIssueShortages.length
          ? `Bắt đầu sản xuất — sinh đề xuất mua ${jobIssueShortages.length} vật tư thiếu`
          : 'Bắt đầu sản xuất',
        performedBy: userId,
      });

      if (!jobIssueShortages.length) {
        return;
      }

      await this.purchaseRequestsService.createShortageRequest(tx, {
        departmentId: await this.usersService.getUserDepartmentId(tx, userId),
        productionOrderId: job.productionOrderId,
        productionJobId: jobId,
        createdBy: userId,
        items: jobIssueShortages,
      });
    });
  }

  /** Vật tư của Job thiếu tồn tại thời điểm bấm start: `requiredQty` (snapshot vừa chốt) trừ tồn
   * kho vật tư hiện tại (gộp mọi kho), chỉ giữ phần dương. Dòng `itemId = NULL` (vật tư bị xoá sau
   * khi snapshot) bị bỏ qua — `purchase_request_items.itemId` là `NOT NULL`, không dựng được dòng.
   * Nhận `tx` — chạy trong transaction của `startJob`, sau `createJobSnapshot`. */
  private async collectJobIssueShortages(
    tx: DbTransaction,
    jobId: string,
  ): Promise<PurchaseRequestShortageItem[]> {
    const jobIssues = await tx
      .select({
        itemId: productionJobIssues.itemId,
        requiredQty: productionJobIssues.requiredQty,
      })
      .from(productionJobIssues)
      .where(eq(productionJobIssues.productionJobId, jobId));

    const itemIds = jobIssues
      .map((row) => row.itemId)
      .filter((id): id is string => id !== null);

    if (!itemIds.length) {
      return [];
    }

    const onHandByItem = await this.inventoryService.getConsumableStockLevels(
      tx,
      itemIds,
    );

    return jobIssues.flatMap((row) => {
      if (!row.itemId) {
        return [];
      }
      const shortage = row.requiredQty - (onHandByItem.get(row.itemId) ?? 0);
      return shortage > 0 ? [{ itemId: row.itemId, quantity: shortage }] : [];
    });
  }

  /** Khoá hàng (`FOR UPDATE`) trước khi `start` — chặn hai lượt bấm "Xác nhận sản xuất" song song
   * trên cùng một Job cùng chốt snapshot chồng nhau. */
  private async getProductionJobForUpdate(
    tx: DbTransaction,
    jobId: string,
  ): Promise<{
    id: string;
    status: ProductionJobStatus;
    quantity: number;
    itemId: string;
    productionOrderId: string;
  }> {
    const [job] = await tx
      .select({
        id: productionJobs.id,
        status: productionJobs.status,
        quantity: productionJobs.quantity,
        itemId: productionJobs.itemId,
        productionOrderId: productionJobs.productionOrderId,
      })
      .from(productionJobs)
      .where(eq(productionJobs.id, jobId))
      .for('update');

    if (!job) {
      throw new AppException(ErrorCode.E082, HttpStatus.NOT_FOUND);
    }

    return job;
  }

  /** Job không tồn tại → `E082`. */
  private async ensureJobExists(jobId: string): Promise<{
    id: string;
    status: ProductionJobStatus;
    quantity: number;
    itemId: string;
    productionOrderId: string;
  }> {
    const job = await this.db.query.productionJobs.findFirst({
      columns: {
        id: true,
        status: true,
        quantity: true,
        itemId: true,
        productionOrderId: true,
      },
      where: eq(productionJobs.id, jobId),
    });

    if (!job) {
      throw new AppException(ErrorCode.E082, HttpStatus.NOT_FOUND);
    }

    return job;
  }

  private ensureStatus(
    current: ProductionJobStatus,
    allowed: ProductionJobStatus[],
  ): void {
    if (!allowed.includes(current)) {
      throw new AppException(ErrorCode.E087, HttpStatus.CONFLICT);
    }
  }

  private async generateJobCodes(
    tx: DbTransaction,
    howMany: number,
  ): Promise<string[]> {
    const sequences = await generateDocumentSequences(
      tx,
      DocumentType.PRODUCTION_JOB,
      0,
      howMany,
    );

    return sequences.map(
      (sequence) => `JOB${String(sequence).padStart(4, '0')}`,
    );
  }
}
