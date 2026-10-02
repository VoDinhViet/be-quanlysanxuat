import { HttpStatus, Inject, Injectable, StreamableFile } from '@nestjs/common';
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
import { DateTime } from 'luxon';

import { OffsetPaginationDto } from '../../common/dto/offset-pagination/offset-pagination.dto';
import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { groupBy } from '../../common/utils/array.util';
import { selectOperations } from './production-job-operations.util';
import {
  DocumentType,
  generateDocumentSequences,
} from '../../common/utils/document-sequence.util';
import { formatVnDate } from '../../common/utils/excel.util';
import { formatQuantity } from '../../common/utils/vnd.util';
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
import { FormTemplateType } from '../../templates/form-templates.registry';
import { PdfRendererService } from '../../templates/pdf-renderer.service';
import { issuedQuantityByJobItemSubquery } from '../inventory-requisitions/inventory-requisitions.query';
import {
  availableQuantityByItemSubquery,
  getAvailableQuantities,
} from '../inventory/available-quantity.query';
import { balanceByItemSubquery } from '../inventory/inventory.query';
import { PurchaseRequestsService } from '../purchase-requests/purchase-requests.service';
import { PurchaseRequestShortageItem } from '../purchase-requests/types/shortage-request.type';
import { UsersService } from '../users/users.service';
import { ExportProductionJobsPlanReqDto } from './dto/export-production-jobs-plan.req.dto';
import { CreateProductionJobIssuesReqDto } from './dto/create-production-job-issues.req.dto';
import { UpdateProductionJobIssueReqDto } from './dto/update-production-job-issue.req.dto';
import { CreateProductionJobNoteReqDto } from './dto/create-production-job-note.req.dto';
import { GetProductionJobBomReqDto } from './dto/get-production-job-bom.req.dto';
import { GetProductionJobLogsReqDto } from './dto/get-production-job-logs.req.dto';
import { GetProductionJobNotesReqDto } from './dto/get-production-job-notes.req.dto';
import { GetProductionJobsReqDto } from './dto/get-production-jobs.req.dto';
import { ProductionJobBomItemResDto } from './dto/production-job-bom-operation.res.dto';
import { ProductionJobPlanOperationResDto } from './dto/production-job-plan-operation.res.dto';
import { ProductionJobDetailResDto } from './dto/production-job-detail.res.dto';
import { ProductionJobIssueResDto } from './dto/production-job-issue.res.dto';
import { ProductionJobLogResDto } from './dto/production-job-log.res.dto';
import { ProductionJobNoteResDto } from './dto/production-job-note.res.dto';
import { ProductionJobResDto } from './dto/production-job.res.dto';
import { UpdateProductionJobOperationDueDateReqDto } from './dto/update-production-job-operation-due-date.req.dto';
import { UpdateProductionJobOperationsPlanReqDto } from './dto/update-production-job-operations-plan.req.dto';
import {
  addJobIssues,
  removeJobIssue,
  updateJobIssue,
} from './production-job-issues.query';
import {
  clearJobSnapshot,
  createJobSnapshot,
} from './production-job-snapshot.query';

/** Job sản xuất — 1 sản phẩm (FG) = 1 Job trong một LSX. Chỉ tạo được qua `createJobs`, gọi từ
 * transaction duyệt LSX (`ProductionOrdersService.approveProductionOrder`) — không có route tạo
 * Job riêng. Snapshot dựng ngay lúc tạo Job (`createJobs`), chụp lại được khi còn `PENDING`
 * (`reloadSnapshot`); Job không bao giờ đọc sống từ sản phẩm. Vòng đời, business rule:
 * `docs/domains/production.md`, `docs/workflows/production-job-execution.md`. */
@Injectable()
export class ProductionJobsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly purchaseRequestsService: PurchaseRequestsService,
    private readonly usersService: UsersService,
    private readonly pdfRendererService: PdfRendererService,
  ) {}

  /** Kế hoạch sản xuất (BM 08-01): mỗi dòng là 1 Job. "Yêu cầu kỹ thuật" và Ghi chú để trống cho
   * người dùng điền tay; ô ký cũng để trống. */
  async exportProductionPlanPdf(
    reqDto: ExportProductionJobsPlanReqDto,
  ): Promise<StreamableFile> {
    const jobRows = await this.db
      .select({
        quantity: productionJobs.quantity,
        item: getTableColumns(items),
        order: getTableColumns(orders),
        client: getTableColumns(clients),
      })
      .from(productionJobs)
      .innerJoin(items, eq(items.id, productionJobs.itemId))
      .innerJoin(
        productionOrders,
        eq(productionOrders.id, productionJobs.productionOrderId),
      )
      .innerJoin(orders, eq(orders.id, productionOrders.orderId))
      .leftJoin(clients, eq(clients.id, orders.clientId))
      .where(inArray(productionJobs.id, reqDto.jobIds))
      .orderBy(asc(orders.dueDate), asc(productionJobs.code));

    if (jobRows.length === 0) {
      throw new AppException(ErrorCode.E082, HttpStatus.NOT_FOUND);
    }

    const customerNames = [
      ...new Set(jobRows.map((row) => row.client?.name ?? '').filter(Boolean)),
    ];
    const totalQuantity = jobRows.reduce((sum, row) => sum + row.quantity, 0);

    const context = {
      customer_name: customerNames.join(', '),
      report_code: `KH-${DateTime.now().toFormat('yyyyLLdd-HHmm')}`,
      report_date: formatVnDate(new Date()),
      total_quantity: formatQuantity(totalQuantity),
      jobs: jobRows.map((row, index) => ({
        stt: index + 1,
        item_code: row.item.code,
        revision: row.item.revision ?? '',
        item_name: row.item.name,
        quantity: formatQuantity(row.quantity),
        technical_requirements: '',
        po_code: row.order.code,
        completion_deadline: formatVnDate(row.order.dueDate),
        note: '',
      })),
    };

    const buffer = await this.pdfRendererService.render(
      FormTemplateType.PRODUCTION_PLAN,
      context,
    );

    const fileName = `ke-hoach-san-xuat-${DateTime.now().toFormat('yyyyLLdd-HHmm')}.pdf`;
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="${fileName}"`,
    });
  }

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
            unaccentILike(orders.buyerPoNo, keyword),
            unaccentILike(items.code, keyword),
            unaccentILike(items.revision, keyword),
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
          buyerPoNo: orders.buyerPoNo,
          item: getTableColumns(items),
          revision: items.revision,
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
        snapshotLoadedAt: productionJobs.snapshotLoadedAt,
        snapshotEditedAt: productionJobs.snapshotEditedAt,
        operationsApprovedBy: productionJobs.operationsApprovedBy,
        operationsApprovedAt: productionJobs.operationsApprovedAt,
        createdAt: productionJobs.createdAt,
        updatedAt: productionJobs.updatedAt,
        item: getTableColumns(items),
        revision: items.revision,
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
   * (1 dòng/vật tư, `requiredQty` = định mức BOM × SL Job, chụp lúc tạo Job hoặc khi tải lại từ sản phẩm lúc
   * `PENDING`) join hai bảng chiều
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
    // Tồn thực tế + khả dụng cùng nguồn với màn Tồn kho vật tư, đọc theo vật tư sống (`itemId`).
    const onHandByItem = balanceByItemSubquery(this.db);
    const availableByItem = availableQuantityByItemSubquery(this.db);

    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select({
          id: productionJobIssues.id,
          item: getTableColumns(productionJobItems),
          unit: getTableColumns(productionJobUnits),
          imageFile: getTableColumns(files),
          onHand: sql<number>`coalesce(${onHandByItem.onHand}, 0)`.mapWith(
            Number,
          ),
          availableQuantity:
            sql<number>`coalesce(${availableByItem.availableQuantity}, 0)`.mapWith(
              Number,
            ),
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
        .leftJoin(files, eq(files.id, productionJobIssues.imageFileId))
        .leftJoin(
          issued,
          and(
            eq(issued.productionJobId, jobId),
            eq(issued.itemId, productionJobIssues.itemId),
          ),
        )
        .leftJoin(
          onHandByItem,
          eq(onHandByItem.itemId, productionJobIssues.itemId),
        )
        .leftJoin(
          availableByItem,
          eq(availableByItem.itemId, productionJobIssues.itemId),
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
   * `docs/decisions/job-snapshot-at-start.md` — Job `PENDING` trả kế hoạch sống, `id` null), gắn xuống từng
   * công đoạn của node. `operationId` optional lọc chỉ trả BOM item nào chứa đúng công đoạn đó —
   * dùng bởi "Thực hiện sản xuất" (`ProductionExecutionService` đọc qua route này, không có route
   * riêng). Mảng thường, không phân trang — số BOM item của một Job luôn nhỏ. */
  async getProductionJobOperations(
    jobId: string,
    operationId?: string,
  ): Promise<ProductionJobBomItemResDto[]> {
    await this.ensureJobExists(jobId);

    const [bomItems, jobOperations] = await Promise.all([
      this.db
        .select({
          ...getTableColumns(productionJobBomItems),
          imageFile: getTableColumns(files),
          revision: items.revision,
        })
        .from(productionJobBomItems)
        .leftJoin(files, eq(files.id, productionJobBomItems.imageFileId))
        .leftJoin(items, eq(items.id, productionJobBomItems.itemId))
        .where(eq(productionJobBomItems.productionJobId, jobId))
        .orderBy(
          asc(productionJobBomItems.sortOrder),
          asc(productionJobBomItems.id),
        ),
      this.db
        .select()
        .from(productionJobOperations)
        .where(eq(productionJobOperations.productionJobId, jobId))
        .orderBy(
          asc(productionJobOperations.sortOrder),
          asc(productionJobOperations.createdAt),
        ),
    ]);

    const operationsByBomItemId = groupBy(
      jobOperations,
      (operation) => operation.productionJobBomItemId,
    );

    const groups = bomItems
      .map((bomItem) => {
        const { operations, nextOperationName } = selectOperations(
          operationsByBomItemId.get(bomItem.id) ?? [],
          operationId,
        );

        return {
          ...bomItem,
          nextOperationName,
          operations: operations.map((operation) => ({
            ...operation,
            plannedQuantity: bomItem.plannedQuantity,
          })),
        };
      })
      .filter((bomItem) => bomItem.operations.length > 0);

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
      throw new AppException(ErrorCode.E082, HttpStatus.NOT_FOUND);
    }
  }

  /** Lập kế hoạch / cập nhật hàng loạt hạn cần hoàn thành của các công đoạn trong Job — chỉ khi Job IN_PROGRESS */

  async getProductionJobPlanOperations(
    jobId: string,
  ): Promise<ProductionJobPlanOperationResDto[]> {
    await this.ensureJobExists(jobId);

    const [bomItems, jobOperations] = await Promise.all([
      this.db
        .select({
          id: productionJobBomItems.id,
          code: productionJobBomItems.code,
          level: productionJobBomItems.level,
        })
        .from(productionJobBomItems)
        .where(eq(productionJobBomItems.productionJobId, jobId)),
      this.db
        .select()
        .from(productionJobOperations)
        .where(eq(productionJobOperations.productionJobId, jobId))
        .orderBy(
          asc(productionJobOperations.sortOrder),
          asc(productionJobOperations.createdAt),
        ),
    ]);

    const bomItemCodeById = new Map<string, string>();
    const bomItemLevelById = new Map<string, number>();
    for (const b of bomItems) {
      if (b.code) bomItemCodeById.set(b.id, b.code);
      bomItemLevelById.set(b.id, b.level);
    }

    const groupedMap = new Map<
      string,
      {
        key: string;
        name: string;
        code: string;
        operationIds: string[];
        bomItemCodes: string[];
        dueDate: Date | null;
        sortOrder: number;
        level: number;
      }
    >();

    for (const op of jobOperations) {
      const groupKey = (op.operationId || op.code || op.name)
        .trim()
        .toLowerCase();
      const bomCode = bomItemCodeById.get(op.productionJobBomItemId);
      const level = bomItemLevelById.get(op.productionJobBomItemId) ?? 0;
      const existing = groupedMap.get(groupKey);

      if (existing) {
        existing.operationIds.push(op.id);
        existing.level = Math.max(existing.level, level);
        existing.sortOrder = Math.min(existing.sortOrder, op.sortOrder ?? 0);
        if (bomCode && !existing.bomItemCodes.includes(bomCode)) {
          existing.bomItemCodes.push(bomCode);
        }
        if (
          op.dueDate &&
          (!existing.dueDate || op.dueDate > existing.dueDate)
        ) {
          existing.dueDate = op.dueDate;
        }
      } else {
        groupedMap.set(groupKey, {
          key: groupKey,
          name: op.name,
          code: op.code,
          operationIds: [op.id],
          bomItemCodes: bomCode ? [bomCode] : [],
          dueDate: op.dueDate ?? null,
          sortOrder: op.sortOrder ?? 0,
          level,
        });
      }
    }

    // `sortOrder` chỉ có nghĩa trong routing của một node, không so sánh được giữa các node — nên
    // thứ tự mặc định đi theo cấp BOM: chi tiết sâu nhất làm trước, thành phẩm (Cấp 0: lắp ráp,
    // đóng gói) làm sau cùng. Kế hoạch đã lưu giữ nguyên thứ tự người dùng xếp (hạn tăng dần,
    // mỗi công đoạn tối thiểu 1 ngày làm việc nên không trùng hạn); chưa có hạn thì xếp sau.
    const result = Array.from(groupedMap.values()).sort(
      (a, b) =>
        (a.dueDate?.getTime() ?? Infinity) -
          (b.dueDate?.getTime() ?? Infinity) ||
        b.level - a.level ||
        a.sortOrder - b.sortOrder,
    );

    return plainToInstance(ProductionJobPlanOperationResDto, result, {
      excludeExtraneousValues: true,
    });
  }

  async updateProductionJobOperationsPlan(
    jobId: string,
    reqDto: UpdateProductionJobOperationsPlanReqDto,
  ): Promise<void> {
    const job = await this.ensureJobExists(jobId);

    this.ensureStatus(job.status, [ProductionJobStatus.IN_PROGRESS]);

    if (!reqDto.operations?.length) {
      return;
    }

    await this.db.transaction(async (tx) => {
      for (const op of reqDto.operations) {
        const ids = op.operationIds?.length
          ? op.operationIds
          : op.id
            ? [op.id]
            : [];
        if (!ids.length) continue;

        await tx
          .update(productionJobOperations)
          .set({ dueDate: op.dueDate })
          .where(
            and(
              inArray(productionJobOperations.id, ids),
              eq(productionJobOperations.productionJobId, jobId),
            ),
          );
      }
    });
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
   * duyệt của `ProductionOrdersService.approveProductionOrder`. Sinh header `production_jobs`
   * (`PENDING`) kèm snapshot BOM/công đoạn/vật tư (`createJobSnapshot`) trong cùng transaction. */
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
        quantity: productionJobs.quantity,
      });

    for (const job of jobRows) {
      await createJobSnapshot(tx, job);
    }

    await tx.insert(productionJobLogs).values(
      jobRows.map((job) => ({
        productionJobId: job.id,
        action: ProductionJobLogAction.CREATED,
        content: `Tạo Job từ LSX đã duyệt (SL kế hoạch ${quantityByItem.get(job.itemId)!})`,
        performedBy: userId,
      })),
    );
  }

  /** Tải lại BOM/công đoạn/vật tư từ sản phẩm gốc — chỉ khi Job còn `PENDING` (`E087` nếu không).
   * Xoá snapshot hiện có rồi chụp lại, ghi đè mọi thay đổi trên Job. */
  async reloadSnapshot(jobId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const job = await this.getProductionJobForUpdate(tx, jobId);
      this.ensureStatus(job.status, [ProductionJobStatus.PENDING]);

      await clearJobSnapshot(tx, jobId);
      await createJobSnapshot(tx, job);
    });
  }

  /** Thêm/sửa/xoá vật tư riêng của Job — chỉ khi `PENDING` (`E087` nếu không), không đụng sản phẩm
   * gốc. Khoá hàng Job để không chồng với `startJob`/`reloadSnapshot`. Sau snapshot,
   * `production_job_issues` là nguồn duy nhất cho nhu cầu vật tư (tab BOM, đề xuất mua, phiếu
   * lãnh); cây `production_job_bom_items` chỉ phục vụ công đoạn nên có thể lệch. */
  async addIssues(
    jobId: string,
    reqDto: CreateProductionJobIssuesReqDto,
    userId: string,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await this.lockPendingJob(tx, jobId);
      await addJobIssues(tx, { jobId, lines: reqDto.items, userId });
    });
  }

  async updateIssue(
    jobId: string,
    issueId: string,
    reqDto: UpdateProductionJobIssueReqDto,
    userId: string,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await this.lockPendingJob(tx, jobId);
      await updateJobIssue(tx, { jobId, issueId, ...reqDto, userId });
    });
  }

  async removeIssue(
    jobId: string,
    issueId: string,
    userId: string,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await this.lockPendingJob(tx, jobId);
      await removeJobIssue(tx, { jobId, issueId, userId });
    });
  }

  private async lockPendingJob(
    tx: DbTransaction,
    jobId: string,
  ): Promise<void> {
    const job = await this.getProductionJobForUpdate(tx, jobId);
    this.ensureStatus(job.status, [ProductionJobStatus.PENDING]);
  }

  /** `PENDING` → `IN_PROGRESS` (`E087` nếu không), ghi `startedBy`/`startedAt`. Dùng snapshot đang
   * có của Job (chỉ chụp bù cho Job cũ tạo trước khi có snapshot lúc tạo). Cùng transaction: vật
   * tư nào của Job thiếu tồn thì sinh một đề xuất mua hàng cho đúng phần thiếu
   * (`PurchaseRequestsService.createShortageRequest`) — không thiếu gì thì không tạo phiếu.
   * Trình tự đầy đủ: `docs/workflows/production-job-execution.md`. */
  async startJob(jobId: string, userId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      // Tính thiếu đọc nhu cầu của mọi Job đã start, mà Job vừa start chỉ hiện ra sau khi commit —
      // hai Job start song song sẽ cùng thấy đủ tồn và không ai sinh đề xuất mua. Khoá mức hệ thống
      // (nhu cầu là tài nguyên dùng chung giữa các Job) để các lần start xếp hàng; khoá tự nhả khi
      // commit/rollback. Luôn lấy trước khoá hàng Job để mọi đường vào cùng thứ tự, không deadlock.
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext('production-job-start'))`,
      );

      const job = await this.getProductionJobForUpdate(tx, jobId);
      this.ensureStatus(job.status, [ProductionJobStatus.PENDING]);

      if (!job.snapshotLoadedAt) {
        await createJobSnapshot(tx, job);
      }

      const shortageItems = await this.getShortageItems(tx, jobId);

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
        content: shortageItems.length
          ? `Xác nhận kế hoạch — sinh đề xuất mua ${shortageItems.length} vật tư thiếu`
          : 'Xác nhận kế hoạch',
        performedBy: userId,
      });

      if (!shortageItems.length) {
        return;
      }

      await this.purchaseRequestsService.createShortageRequest(tx, {
        departmentId: await this.usersService.getUserDepartmentId(tx, userId),
        productionOrderId: job.productionOrderId,
        productionJobId: jobId,
        createdBy: userId,
        items: shortageItems,
      });
    });
  }

  /** Vật tư của Job thiếu tồn tại thời điểm bấm start: `requiredQty` (snapshot vừa chốt) trừ tồn
   * **khả dụng** (tồn thực tế − phiếu lãnh đã duyệt giữ chỗ − nhu cầu các Job khác, không tính
   * chính Job này), chỉ giữ phần dương — trừ tồn thực tế sẽ bỏ sót vật tư đã bị giữ chỗ. Dòng
   * `itemId = NULL` (vật tư bị xoá sau khi snapshot) bị bỏ qua — `purchase_request_items.itemId`
   * là `NOT NULL`, không dựng được dòng.
   * Nhận `tx` — chạy trong transaction của `startJob`, sau `createJobSnapshot`. */
  private async getShortageItems(
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

    // Tồn khả dụng của từng vật tư NGAY TRƯỚC Job này (loại nhu cầu của chính Job, vì snapshot vừa
    // chốt nên nhu cầu của nó đã nằm trong `production_job_issues`). Âm nghĩa là đã bị Job/phiếu lãnh
    // khác giữ chỗ quá mức: lúc đó coi như còn 0 và phải mua đủ nhu cầu.
    const availableByItem = await getAvailableQuantities(tx, {
      itemIds,
      excludeJobId: jobId,
    });

    return jobIssues.flatMap((row) => {
      if (!row.itemId) {
        return [];
      }
      const available = Math.max(availableByItem.get(row.itemId) ?? 0, 0);
      const shortage = row.requiredQty - available;
      return shortage > 0
        ? [
            {
              itemId: row.itemId,
              quantity: shortage,
              fromStockQty: row.requiredQty - shortage,
            },
          ]
        : [];
    });
  }

  /** Khoá hàng (`FOR UPDATE`) trước khi `start` — chặn hai lượt bấm "Xác nhận sản xuất" song song
   * trên cùng một Job (hoặc start song song với tải lại snapshot). */
  private async getProductionJobForUpdate(
    tx: DbTransaction,
    jobId: string,
  ): Promise<{
    id: string;
    status: ProductionJobStatus;
    quantity: number;
    itemId: string;
    productionOrderId: string;
    snapshotLoadedAt: Date | null;
  }> {
    const [job] = await tx
      .select({
        id: productionJobs.id,
        snapshotLoadedAt: productionJobs.snapshotLoadedAt,
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
