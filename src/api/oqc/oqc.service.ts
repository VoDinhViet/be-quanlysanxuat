import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  getTableColumns,
  gte,
  inArray,
  isNull,
  lt,
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
  IqcResult,
  items,
  OqcDisposition,
  oqcInspections,
  OqcStatus,
  orders,
  productionJobBomItems,
  productionJobOperations,
  productionJobs,
  productionOrders,
  ProductionJobStatus,
  units,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { resolveAqlPlan, resolveAqlResult } from '../iqc/iqc-aql.constant';
import { getPlannedQuantitiesByJob } from '../outsourcing-orders/outsourcing-orders.query';
import { AqlPlanResDto } from './dto/aql-plan.res.dto';
import { ConfirmOqcReqDto } from './dto/confirm-oqc.req.dto';
import { CreateOqcReqDto } from './dto/create-oqc.req.dto';
import { GetAqlPlanReqDto } from './dto/get-aql-plan.req.dto';
import { GetInspectableOperationsReqDto } from './dto/get-inspectable-operations.req.dto';
import { GetOqcsReqDto } from './dto/get-oqcs.req.dto';
import { InspectableOperationResDto } from './dto/inspectable-operation.res.dto';
import { OqcResDto } from './dto/oqc.res.dto';
import { PageOqcResDto } from './dto/page-oqc.res.dto';
import {
  getInspectedQuantityByBomItemId,
  getInspectedQuantityByOperationIds,
  inspectedQuantityByJobOperationSubquery,
} from './oqc.query';

@Injectable()
export class OqcService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async getOqcs(
    reqDto: GetOqcsReqDto,
  ): Promise<OffsetPaginatedDto<PageOqcResDto>> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;
    const materialKeyword = reqDto.materialKeyword
      ? `%${reqDto.materialKeyword}%`
      : undefined;

    const where = and(
      keyword ? unaccentILike(oqcInspections.code, keyword) : undefined,
      reqDto.productionJobId
        ? eq(oqcInspections.productionJobId, reqDto.productionJobId)
        : undefined,
      reqDto.productionJobOperationId
        ? eq(
            oqcInspections.productionJobOperationId,
            reqDto.productionJobOperationId,
          )
        : undefined,
      reqDto.itemId ? eq(oqcInspections.itemId, reqDto.itemId) : undefined,
      reqDto.result ? eq(oqcInspections.result, reqDto.result) : undefined,
      reqDto.status ? eq(oqcInspections.status, reqDto.status) : undefined,
      reqDto.disposition
        ? eq(oqcInspections.disposition, reqDto.disposition)
        : undefined,
      materialKeyword
        ? exists(
            this.db
              .select({ one: sql`1` })
              .from(items)
              .where(
                and(
                  eq(items.id, oqcInspections.itemId),
                  or(
                    unaccentILike(items.name, materialKeyword),
                    unaccentILike(items.code, materialKeyword),
                  ),
                ),
              ),
          )
        : undefined,
      reqDto.fromDate
        ? gte(oqcInspections.inspectionDate, reqDto.fromDate)
        : undefined,
      reqDto.toDate
        ? lt(
            oqcInspections.inspectionDate,
            new Date(reqDto.toDate.getTime() + 24 * 60 * 60 * 1000),
          )
        : undefined,
    );

    // Bước 1: lọc/phân trang trên bảng gốc, `orderCode` cưỡi cùng qua LEFT JOIN (không dùng để
    // lọc/sort — chỉ là cột hiển thị suy từ Job, relational query API không diễn đạt được).
    const [idRows, countRows] = await Promise.all([
      this.db
        .select({ id: oqcInspections.id, orderCode: orders.code })
        .from(oqcInspections)
        .leftJoin(
          productionJobs,
          eq(productionJobs.id, oqcInspections.productionJobId),
        )
        .leftJoin(
          productionOrders,
          eq(productionOrders.id, productionJobs.productionOrderId),
        )
        .leftJoin(orders, eq(orders.id, productionOrders.orderId))
        .where(where)
        .orderBy(desc(oqcInspections.createdAt))
        .limit(reqDto.limit)
        .offset(reqDto.offset),
      this.db
        .select({ total: count() })
        .from(oqcInspections)
        .leftJoin(
          productionJobs,
          eq(productionJobs.id, oqcInspections.productionJobId),
        )
        .leftJoin(
          productionOrders,
          eq(productionOrders.id, productionJobs.productionOrderId),
        )
        .leftJoin(orders, eq(orders.id, productionOrders.orderId))
        .where(where),
    ]);

    const ids = idRows.map((row) => row.id);

    // Bước 2: hydrate quan hệ — chỉ cho đúng trang hiện tại.
    const entities = ids.length
      ? await this.db.query.oqcInspections.findMany({
          where: inArray(oqcInspections.id, ids),
          with: {
            productionJob: true,
            item: { with: { unit: true } },
            creatorBy: true,
          },
        })
      : [];

    const entityById = new Map(entities.map((entity) => [entity.id, entity]));

    // Giữ đúng thứ tự đã sắp/phân trang ở bước 1 — `findMany` không đảm bảo giữ thứ tự `inArray`.
    const rows = idRows.flatMap((row) => {
      const entity = entityById.get(row.id);
      if (!entity) return [];
      return [{ ...entity, orderCode: row.orderCode }];
    });

    return new OffsetPaginatedDto(
      plainToInstance(PageOqcResDto, rows, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(countRows[0]?.total ?? 0, reqDto),
    );
  }

  async getOqc(oqcId: string): Promise<OqcResDto> {
    const row = await this.db.query.oqcInspections.findFirst({
      where: eq(oqcInspections.id, oqcId),
      with: {
        productionJob: true,
        item: { with: { unit: true } },
        creatorBy: true,
        confirmerBy: true,
        resolverBy: true,
      },
    });

    if (!row) {
      throw new AppException(ErrorCode.E174, HttpStatus.NOT_FOUND);
    }

    const orderCode = row.productionJobId
      ? await this.resolveOrderCode(row.productionJobId)
      : null;

    const plan =
      row.inspectionLevel && row.aqlLevel
        ? resolveAqlPlan(row.quantity, row.inspectionLevel, row.aqlLevel)
        : undefined;

    return plainToInstance(
      OqcResDto,
      {
        ...row,
        orderCode,
        codeLetter: plan?.codeLetter ?? null,
        suggestedSampleSize: plan?.sampleSize ?? null,
        ac: plan?.ac ?? null,
        re: plan?.re ?? null,
      },
      { excludeExtraneousValues: true },
    );
  }

  /** Popup "Yêu cầu QC" — copy khuôn `OutsourcingOrdersService.getOutsourceableOperations`, khác:
   * không lọc `type = OUTSOURCE` (OQC áp cho mọi công đoạn, không riêng gia công ngoài), và mốc so
   * sánh là tiến độ QC (`completedQuantity` so `inspectedQuantity`), không phải SL gửi gia công. */
  async getInspectableOperations(
    reqDto: GetInspectableOperationsReqDto,
  ): Promise<OffsetPaginatedDto<InspectableOperationResDto>> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;

    const where = and(
      eq(productionJobs.status, ProductionJobStatus.IN_PROGRESS),
      reqDto.productionJobId
        ? eq(productionJobs.id, reqDto.productionJobId)
        : undefined,
      reqDto.operationId
        ? eq(productionJobOperations.operationId, reqDto.operationId)
        : undefined,
      keyword
        ? or(
            unaccentILike(productionJobs.code, keyword),
            unaccentILike(productionJobBomItems.code, keyword),
            unaccentILike(productionJobBomItems.name, keyword),
            unaccentILike(productionJobOperations.code, keyword),
            unaccentILike(productionJobOperations.name, keyword),
          )
        : undefined,
    );

    const inspectedQuantityByOperation =
      inspectedQuantityByJobOperationSubquery(this.db);

    const [operations, [{ total }]] = await Promise.all([
      this.db
        .select({
          productionJobOperationId: productionJobOperations.id,
          operation: getTableColumns(productionJobOperations),
          job: getTableColumns(productionJobs),
          part: getTableColumns(productionJobBomItems),
          unit: getTableColumns(units),
          inspectedQuantity:
            sql<number>`coalesce(${inspectedQuantityByOperation.inspectedQuantity}, 0)`.mapWith(
              Number,
            ),
        })
        .from(productionJobOperations)
        .innerJoin(
          productionJobs,
          eq(productionJobs.id, productionJobOperations.productionJobId),
        )
        .innerJoin(
          productionJobBomItems,
          eq(
            productionJobBomItems.id,
            productionJobOperations.productionJobBomItemId,
          ),
        )
        .innerJoin(
          items,
          and(
            eq(items.id, productionJobBomItems.itemId),
            isNull(items.deletedAt),
          ),
        )
        .innerJoin(units, eq(units.id, items.unitId))
        .leftJoin(
          inspectedQuantityByOperation,
          eq(
            inspectedQuantityByOperation.productionJobOperationId,
            productionJobOperations.id,
          ),
        )
        .where(where)
        .orderBy(
          asc(productionJobs.code),
          asc(productionJobBomItems.sortOrder),
          asc(productionJobOperations.sortOrder),
        )
        .limit(reqDto.limit)
        .offset(reqDto.offset),
      this.db
        .select({ total: count() })
        .from(productionJobOperations)
        .innerJoin(
          productionJobs,
          eq(productionJobs.id, productionJobOperations.productionJobId),
        )
        .innerJoin(
          productionJobBomItems,
          eq(
            productionJobBomItems.id,
            productionJobOperations.productionJobBomItemId,
          ),
        )
        .innerJoin(
          items,
          and(
            eq(items.id, productionJobBomItems.itemId),
            isNull(items.deletedAt),
          ),
        )
        .innerJoin(units, eq(units.id, items.unitId))
        .where(where),
    ]);

    const rows = operations.map((row) => ({
      ...row,
      completedQuantity: row.operation.completedQuantity,
      remainingQuantity:
        row.operation.completedQuantity - row.inspectedQuantity,
    }));

    return new OffsetPaginatedDto(
      plainToInstance(InspectableOperationResDto, rows, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(total, reqDto),
    );
  }

  /** Thứ tự kiểm: công đoạn tồn tại (`E091`) → Job đang `IN_PROGRESS` (`E175`) → node BOM chứa công
   * đoạn còn `itemId` để snapshot (`E199`) → Σ SL đã xin QC của cả node (mọi công đoạn as-used cùng
   * node) không vượt SL kế hoạch node (`E176`) → Σ SL đã xin QC của riêng công đoạn này không vượt
   * `completedQuantity` xưởng đã báo hoàn thành (`E198`). */
  async createOqc(reqDto: CreateOqcReqDto, userId: string): Promise<void> {
    const operation = await this.ensureOperationExists(
      reqDto.productionJobOperationId,
    );

    if (operation.productionJob.status !== ProductionJobStatus.IN_PROGRESS) {
      throw new AppException(ErrorCode.E175, HttpStatus.CONFLICT);
    }

    const itemId = operation.bomItem.itemId;
    if (!itemId) {
      throw new AppException(ErrorCode.E199, HttpStatus.CONFLICT);
    }

    await this.ensureLotSizeWithinPlannedNode(
      operation.productionJob,
      operation.bomItem.id,
      reqDto.quantity,
    );
    await this.ensureWithinCompletedQuantity(operation, reqDto.quantity);

    let code = reqDto.code;
    if (code) {
      await this.validateCodeUniqueness(code);
    } else {
      code = await this.generateOqcCode(this.db, reqDto.inspectionDate);
    }

    await this.db.insert(oqcInspections).values({
      ...reqDto,
      code,
      productionJobId: operation.productionJob.id,
      operationCode: operation.code,
      operationName: operation.name,
      partCode: operation.bomItem.code,
      partName: operation.bomItem.name,
      itemId,
      createdBy: userId,
    });
  }

  getAqlPlan(reqDto: GetAqlPlanReqDto): AqlPlanResDto {
    const plan = resolveAqlPlan(
      reqDto.quantity,
      reqDto.inspectionLevel,
      reqDto.aqlLevel,
    );

    if (!plan) {
      throw new AppException(ErrorCode.E200, HttpStatus.NOT_FOUND);
    }

    return plainToInstance(AqlPlanResDto, plan, {
      excludeExtraneousValues: true,
    });
  }

  /** `resultAuto` tự suy từ Ac/Re (`resolveAqlResult`) — `result` client gửi thắng nếu có, vắng thì
   * lấy `resultAuto` (cả hai đều vắng → `E200`); lệch `resultAuto` mà thiếu `resultNote` → `E201`.
   * `status` suy theo bảng: PASS → `COMPLETED`; FAIL+null → `PENDING`; FAIL+`REWORK` → `REWORK`
   * (phiếu vẫn mở, QC kiểm lại trên chính phiếu); FAIL+`ACCEPT`/`SCRAP` → `COMPLETED`. Không ghi
   * ngược `production_job_operations` ở bất kỳ nhánh nào — tránh race với thao tác tay của xưởng
   * (`PATCH .../operations/:operationId`), `docs/domains/production.md`. */
  async confirmOqc(
    oqcId: string,
    reqDto: ConfirmOqcReqDto,
    userId: string,
  ): Promise<void> {
    const inspection = await this.ensureOqcConfirmable(oqcId);

    const plan = resolveAqlPlan(
      inspection.quantity,
      reqDto.inspectionLevel,
      reqDto.aqlLevel,
    );
    const resultAuto = plan
      ? resolveAqlResult(plan, reqDto.defectQty)
      : undefined;

    if (!reqDto.result && !resultAuto) {
      throw new AppException(ErrorCode.E200, HttpStatus.BAD_REQUEST);
    }
    const result = reqDto.result ?? resultAuto!;

    if (resultAuto && result !== resultAuto && !reqDto.resultNote) {
      throw new AppException(ErrorCode.E201, HttpStatus.BAD_REQUEST);
    }
    if (result === IqcResult.PASS && reqDto.disposition) {
      throw new AppException(ErrorCode.E202, HttpStatus.BAD_REQUEST);
    }

    const isPass = result === IqcResult.PASS;
    const status = this.resolveOqcStatus(result, reqDto.disposition);
    const isFirstConfirm = inspection.confirmedAt === null;
    const isFirstResolve =
      !isPass && !!reqDto.disposition && !inspection.resolvedAt;

    await this.db
      .update(oqcInspections)
      .set({
        inspectionLevel: reqDto.inspectionLevel,
        aqlLevel: reqDto.aqlLevel,
        sampleSize: reqDto.sampleSize ?? plan?.sampleSize ?? null,
        defectQty: reqDto.defectQty,
        result,
        resultAuto: resultAuto ?? null,
        resultNote: reqDto.resultNote ?? null,
        disposition: isPass ? null : (reqDto.disposition ?? null),
        dispositionNote: isPass ? null : (reqDto.dispositionNote ?? null),
        status,
        confirmedBy: isFirstConfirm ? userId : undefined,
        confirmedAt: isFirstConfirm ? new Date() : undefined,
        resolvedBy:
          isPass || !reqDto.disposition
            ? null
            : isFirstResolve
              ? userId
              : undefined,
        resolvedAt:
          isPass || !reqDto.disposition
            ? null
            : isFirstResolve
              ? new Date()
              : undefined,
      })
      .where(eq(oqcInspections.id, oqcId));
  }

  async deleteOqc(oqcId: string): Promise<void> {
    const inspection = await this.db.query.oqcInspections.findFirst({
      columns: { status: true },
      where: eq(oqcInspections.id, oqcId),
    });

    if (!inspection) {
      throw new AppException(ErrorCode.E174, HttpStatus.NOT_FOUND);
    }
    if (inspection.status !== OqcStatus.NOT_INSPECTED) {
      throw new AppException(ErrorCode.E178, HttpStatus.CONFLICT);
    }

    await this.db.delete(oqcInspections).where(eq(oqcInspections.id, oqcId));
  }

  /** "PO" hiển thị trên màn OQC = `orders.code` (tên chính thức, xem
   * `ProductionJobResDto.orderCode`) — tính lúc đọc qua join, không lưu cột. Chỉ dùng cho 1 dòng
   * (`getOqc`) — list tự cưỡi cùng qua LEFT JOIN ở `getOqcs`, không lặp gọi hàm này N lần. */
  private async resolveOrderCode(
    productionJobId: string,
  ): Promise<string | null> {
    const [row] = await this.db
      .select({ orderCode: orders.code })
      .from(productionJobs)
      .innerJoin(
        productionOrders,
        eq(productionOrders.id, productionJobs.productionOrderId),
      )
      .innerJoin(orders, eq(orders.id, productionOrders.orderId))
      .where(eq(productionJobs.id, productionJobId));

    return row?.orderCode ?? null;
  }

  private resolveOqcStatus(
    result: IqcResult,
    disposition: OqcDisposition | undefined,
  ): OqcStatus {
    if (result === IqcResult.PASS) {
      return OqcStatus.COMPLETED;
    }
    if (!disposition) {
      return OqcStatus.PENDING;
    }
    return disposition === OqcDisposition.REWORK
      ? OqcStatus.REWORK
      : OqcStatus.COMPLETED;
  }

  private async ensureOperationExists(productionJobOperationId: string) {
    const operation = await this.db.query.productionJobOperations.findFirst({
      where: eq(productionJobOperations.id, productionJobOperationId),
      with: {
        productionJob: { columns: { id: true, status: true, quantity: true } },
        bomItem: {
          columns: { id: true, code: true, name: true, itemId: true },
        },
      },
    });

    if (!operation) {
      throw new AppException(ErrorCode.E091, HttpStatus.NOT_FOUND);
    }

    return operation;
  }

  /** Σ SL đã xin QC của MỌI công đoạn as-used cùng một node BOM (không riêng công đoạn đang tạo),
   * cộng lô mới, không được vượt SL kế hoạch của chính node đó (`resolvePlannedQuantities`) — 1 node
   * có thể có nhiều bước, nhưng cùng là 1 part vật lý nên trần phải tính gộp. Cho phép kiểm nhiều
   * lần từng phần (partial). */
  private async ensureLotSizeWithinPlannedNode(
    job: { id: string; quantity: number },
    bomItemId: string,
    newQuantity: number,
  ): Promise<void> {
    const plannedByJob = await getPlannedQuantitiesByJob(
      this.db,
      new Map([[job.id, job.quantity]]),
    );
    const planned = plannedByJob.get(job.id)?.get(bomItemId) ?? 0;
    const inspected = await getInspectedQuantityByBomItemId(this.db, bomItemId);

    if (inspected + newQuantity > planned) {
      throw new AppException(ErrorCode.E176, HttpStatus.BAD_REQUEST);
    }
  }

  /** Σ SL đã xin QC của riêng công đoạn này, cộng lô mới, không được vượt `completedQuantity` hiện
   * tại — QC không được xin kiểm nhiều hơn phần xưởng đã báo hoàn thành ở đúng bước đó. */
  private async ensureWithinCompletedQuantity(
    operation: { id: string; completedQuantity: number },
    newQuantity: number,
  ): Promise<void> {
    const inspectedByOperation = await getInspectedQuantityByOperationIds(
      this.db,
      [operation.id],
    );
    const inspected = inspectedByOperation.get(operation.id) ?? 0;

    if (inspected + newQuantity > operation.completedQuantity) {
      throw new AppException(ErrorCode.E198, HttpStatus.BAD_REQUEST);
    }
  }

  private async ensureOqcConfirmable(oqcId: string): Promise<{
    quantity: number;
    confirmedAt: Date | null;
    resolvedAt: Date | null;
  }> {
    const inspection = await this.db.query.oqcInspections.findFirst({
      columns: {
        quantity: true,
        confirmedAt: true,
        resolvedAt: true,
        status: true,
      },
      where: eq(oqcInspections.id, oqcId),
    });

    if (!inspection) {
      throw new AppException(ErrorCode.E174, HttpStatus.NOT_FOUND);
    }
    if (inspection.status === OqcStatus.COMPLETED) {
      throw new AppException(ErrorCode.E177, HttpStatus.CONFLICT);
    }

    return inspection;
  }

  private async validateCodeUniqueness(code: string): Promise<void> {
    const existing = await this.db.query.oqcInspections.findFirst({
      columns: { id: true },
      where: eq(oqcInspections.code, code),
    });

    if (existing) {
      throw new AppException(ErrorCode.E181, HttpStatus.CONFLICT);
    }
  }

  private async generateOqcCode(
    db: Database | DbTransaction,
    inspectionDate: Date,
  ): Promise<string> {
    const year = inspectionDate.getFullYear();
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year + 1, 0, 1);
    const [totalRows] = await db
      .select({ total: count() })
      .from(oqcInspections)
      .where(
        and(
          gte(oqcInspections.inspectionDate, yearStart),
          lt(oqcInspections.inspectionDate, yearEnd),
        ),
      );
    return `OQC-${year}-${String((totalRows?.total ?? 0) + 1).padStart(5, '0')}`;
  }
}
