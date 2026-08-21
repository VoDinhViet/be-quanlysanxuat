import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import {
  and,
  count,
  desc,
  eq,
  getTableColumns,
  gte,
  lt,
  ne,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { OffsetPaginationDto } from '../../common/dto/offset-pagination/offset-pagination.dto';
import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import {
  DocumentType,
  generateDocumentSequence,
} from '../../common/utils/document-sequence.util';
import { unaccentILike } from '../../common/utils/search.util';
import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import type { Database, DbTransaction } from '../../database/database.type';
import {
  IqcResult,
  items,
  ItemType,
  OperationType,
  OqcDisposition,
  OqcStatus,
  orders,
  productionJobBomItems,
  productionJobOperations,
  productionJobs,
  productionOrders,
  ProductionJobStatus,
  QcKind,
  qualityInspections,
  units,
  users,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { resolveAqlPlan, resolveAqlResult } from '../iqc/iqc-aql.constant';
import { AqlPlanResDto } from './dto/aql-plan.res.dto';
import { ConfirmOqcReqDto } from './dto/confirm-oqc.req.dto';
import { GetAqlPlanReqDto } from './dto/get-aql-plan.req.dto';
import { GetOqcsReqDto } from './dto/get-oqcs.req.dto';
import { OqcResDto } from './dto/oqc.res.dto';
import { PageOqcResDto } from './dto/page-oqc.res.dto';
import {
  getInspectedQuantityByBomItemId,
  getInspectedQuantityByOperationId,
} from './oqc.query';

@Injectable()
export class OqcService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async getOqcs(
    reqDto: GetOqcsReqDto,
  ): Promise<OffsetPaginatedDto<PageOqcResDto>> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;

    const where = and(
      eq(qualityInspections.kind, QcKind.OUTGOING),
      keyword ? unaccentILike(qualityInspections.code, keyword) : undefined,
      reqDto.productionJobId
        ? eq(qualityInspections.productionJobId, reqDto.productionJobId)
        : undefined,
      reqDto.productionJobOperationId
        ? eq(
            qualityInspections.productionJobOperationId,
            reqDto.productionJobOperationId,
          )
        : undefined,
      reqDto.itemId ? eq(qualityInspections.itemId, reqDto.itemId) : undefined,
      reqDto.result ? eq(qualityInspections.result, reqDto.result) : undefined,
      reqDto.status ? eq(qualityInspections.status, reqDto.status) : undefined,
      reqDto.disposition
        ? eq(qualityInspections.disposition, reqDto.disposition)
        : undefined,
      reqDto.fromDate
        ? gte(qualityInspections.inspectionDate, reqDto.fromDate)
        : undefined,
      reqDto.toDate
        ? lt(
            qualityInspections.inspectionDate,
            new Date(reqDto.toDate.getTime() + 24 * 60 * 60 * 1000),
          )
        : undefined,
    );

    // Một `.select()` phẳng — join tường minh thay vì `db.query` quan hệ + hydrate riêng
    // (`docs/decisions/qc-single-table.md`). `productionJobOperations`/`productionJobBomItems`/
    // `items` dùng `innerJoin` — `chk_quality_inspections_outgoing_job` đảm bảo mọi dòng
    // `kind = OUTGOING` (đã lọc ở `where`) luôn có cả hai, nên Drizzle tự suy kiểu non-null, không
    // cần assertion. `items` join qua `qualityInspections.itemId` (snapshot riêng, `NOT NULL`) —
    // KHÔNG PHẢI `productionJobBomItems.itemId` (cột đó nullable, `bomItem` chỉ cho `code`/`name`).
    // `item`/`unit` ngang hàng (không lồng `item.unit`) — cùng khuôn `OutboundOrderItemResDto`,
    // khớp thẳng shape select nên không cần map lại.
    const [rows, countRows] = await Promise.all([
      this.db
        .select({
          id: qualityInspections.id,
          code: qualityInspections.code,
          quantity: qualityInspections.quantity,
          inspectionDate: qualityInspections.inspectionDate,
          result: qualityInspections.result,
          status: qualityInspections.status,
          disposition: qualityInspections.disposition,
          note: qualityInspections.note,
          createdAt: qualityInspections.createdAt,
          updatedAt: qualityInspections.updatedAt,
          productionJob: getTableColumns(productionJobs),
          orderCode: orders.code,
          operation: getTableColumns(productionJobOperations),
          bomItem: getTableColumns(productionJobBomItems),
          item: getTableColumns(items),
          unit: getTableColumns(units),
          creatorBy: getTableColumns(users),
        })
        .from(qualityInspections)
        .innerJoin(
          productionJobs,
          eq(productionJobs.id, qualityInspections.productionJobId),
        )
        .leftJoin(
          productionOrders,
          eq(productionOrders.id, productionJobs.productionOrderId),
        )
        .leftJoin(orders, eq(orders.id, productionOrders.orderId))
        .innerJoin(
          productionJobOperations,
          eq(
            productionJobOperations.id,
            qualityInspections.productionJobOperationId,
          ),
        )
        .innerJoin(
          productionJobBomItems,
          eq(
            productionJobBomItems.id,
            productionJobOperations.productionJobBomItemId,
          ),
        )
        .innerJoin(items, eq(items.id, qualityInspections.itemId))
        .innerJoin(units, eq(units.id, items.unitId))
        .leftJoin(users, eq(users.id, qualityInspections.createdBy))
        .where(where)
        .orderBy(desc(qualityInspections.createdAt))
        .limit(reqDto.limit)
        .offset(reqDto.offset),
      this.db.select({ total: count() }).from(qualityInspections).where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(PageOqcResDto, rows, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(countRows[0]?.total ?? 0, reqDto),
    );
  }

  async getOqc(oqcId: string): Promise<OqcResDto> {
    // Cùng khuôn `getOqcs` — `.select()` phẳng + join tường minh, không qua `db.query` quan hệ.
    // `productionJobOperations`/`productionJobBomItems`/`items` dùng `innerJoin`
    // (`chk_quality_inspections_outgoing_job` đảm bảo non-null cho `kind = OUTGOING`), 3 alias
    // `users` riêng cho `creatorBy`/`confirmerBy`/`resolverBy` (ba FK độc lập, cùng bảng đích).
    const creatorUsers = alias(users, 'oqc_creator');
    const confirmerUsers = alias(users, 'oqc_confirmer');
    const resolverUsers = alias(users, 'oqc_resolver');

    const [row] = await this.db
      .select({
        id: qualityInspections.id,
        code: qualityInspections.code,
        quantity: qualityInspections.quantity,
        inspectionDate: qualityInspections.inspectionDate,
        inspectionLevel: qualityInspections.inspectionLevel,
        aqlLevel: qualityInspections.aqlLevel,
        sampleSize: qualityInspections.sampleSize,
        defectQty: qualityInspections.defectQty,
        resultAuto: qualityInspections.resultAuto,
        result: qualityInspections.result,
        status: qualityInspections.status,
        resultNote: qualityInspections.resultNote,
        disposition: qualityInspections.disposition,
        dispositionNote: qualityInspections.dispositionNote,
        note: qualityInspections.note,
        confirmedAt: qualityInspections.confirmedAt,
        resolvedAt: qualityInspections.resolvedAt,
        createdAt: qualityInspections.createdAt,
        updatedAt: qualityInspections.updatedAt,
        productionJob: getTableColumns(productionJobs),
        orderCode: orders.code,
        operation: getTableColumns(productionJobOperations),
        bomItem: getTableColumns(productionJobBomItems),
        item: getTableColumns(items),
        unit: getTableColumns(units),
        creatorBy: getTableColumns(creatorUsers),
        confirmerBy: getTableColumns(confirmerUsers),
        resolverBy: getTableColumns(resolverUsers),
      })
      .from(qualityInspections)
      .innerJoin(
        productionJobs,
        eq(productionJobs.id, qualityInspections.productionJobId),
      )
      .leftJoin(
        productionOrders,
        eq(productionOrders.id, productionJobs.productionOrderId),
      )
      .leftJoin(orders, eq(orders.id, productionOrders.orderId))
      .innerJoin(
        productionJobOperations,
        eq(
          productionJobOperations.id,
          qualityInspections.productionJobOperationId,
        ),
      )
      .innerJoin(
        productionJobBomItems,
        eq(
          productionJobBomItems.id,
          productionJobOperations.productionJobBomItemId,
        ),
      )
      .innerJoin(items, eq(items.id, qualityInspections.itemId))
      .innerJoin(units, eq(units.id, items.unitId))
      .leftJoin(creatorUsers, eq(creatorUsers.id, qualityInspections.createdBy))
      .leftJoin(
        confirmerUsers,
        eq(confirmerUsers.id, qualityInspections.confirmedBy),
      )
      .leftJoin(
        resolverUsers,
        eq(resolverUsers.id, qualityInspections.resolvedBy),
      )
      .where(
        and(
          eq(qualityInspections.kind, QcKind.OUTGOING),
          eq(qualityInspections.id, oqcId),
        ),
      )
      .limit(1);

    if (!row) {
      throw new AppException(ErrorCode.E174, HttpStatus.NOT_FOUND);
    }

    const plan =
      row.inspectionLevel && row.aqlLevel
        ? resolveAqlPlan(row.quantity, row.inspectionLevel, row.aqlLevel)
        : undefined;

    return plainToInstance(
      OqcResDto,
      {
        ...row,
        codeLetter: plan?.codeLetter ?? null,
        suggestedSampleSize: plan?.sampleSize ?? null,
        ac: plan?.ac ?? null,
        re: plan?.re ?? null,
      },
      { excludeExtraneousValues: true },
    );
  }

  /** "Yêu cầu QC" cấp Job — 1 cú bấm, không cần nhập gì. Một câu `SELECT` gộp mọi điều kiện: Job
   * tồn tại + `IN_PROGRESS` (`E082`/`E175`), có node Cấp 0 hợp lệ (`itemType='FG'`, `type ≠
   * OUTSOURCE` — gia công ngoài chỉ QC qua IQC, không qua OQC, thiếu thì `E213`), công đoạn đó đã
   * `completedDate` (`E214`), còn `itemId` để snapshot (`E199`) — `uq_production_job_bom_items_
   * final_assembly` đảm bảo tối đa 1 node Cấp 0/Job, và `E210` đã đảm bảo công đoạn Cấp 0 không thể
   * `completedDate` trừ khi mọi công đoạn khác của Job xong trước, nên kiểm đúng công đoạn này là
   * đủ, không cần lặp qua cả Job. Hai `LEFT JOIN` (không phải `INNER`) để phân biệt đúng "Job không
   * tồn tại" khỏi "Job tồn tại nhưng thiếu node/công đoạn hợp lệ" — cả hai ca sau vẫn phải trả về 1
   * dòng, không phải 0. `quantity` lấy thẳng `completedQuantity` của công đoạn Cấp 0 — lô kiểm
   * luôn là toàn bộ SL đã hoàn thành, không phải một phần. */
  async createOqcForJob(jobId: string, userId: string): Promise<void> {
    const [row] = await this.db
      .select({
        jobStatus: productionJobs.status,
        operationId: productionJobOperations.id,
        completedDate: productionJobOperations.completedDate,
        completedQuantity: productionJobOperations.completedQuantity,
        bomItemId: productionJobBomItems.id,
        itemId: productionJobBomItems.itemId,
        plannedQuantity: productionJobBomItems.plannedQuantity,
      })
      .from(productionJobs)
      .leftJoin(
        productionJobBomItems,
        and(
          eq(productionJobBomItems.productionJobId, productionJobs.id),
          eq(productionJobBomItems.itemType, ItemType.FG),
        ),
      )
      .leftJoin(
        productionJobOperations,
        and(
          eq(
            productionJobOperations.productionJobBomItemId,
            productionJobBomItems.id,
          ),
          ne(productionJobOperations.type, OperationType.OUTSOURCE),
        ),
      )
      .where(eq(productionJobs.id, jobId))
      .orderBy(desc(productionJobOperations.sortOrder))
      .limit(1);

    if (!row) {
      throw new AppException(ErrorCode.E082, HttpStatus.NOT_FOUND);
    }

    if (row.jobStatus !== ProductionJobStatus.IN_PROGRESS) {
      throw new AppException(ErrorCode.E175, HttpStatus.CONFLICT);
    }

    if (!row.operationId) {
      throw new AppException(ErrorCode.E213, HttpStatus.BAD_REQUEST);
    }

    if (!row.completedDate) {
      throw new AppException(ErrorCode.E214, HttpStatus.BAD_REQUEST);
    }

    if (!row.itemId) {
      throw new AppException(ErrorCode.E199, HttpStatus.CONFLICT);
    }

    // LEFT JOIN khiến các cột trên khiến kiểu nullable, nhưng đã qua đủ 4 kiểm phía trên nghĩa là
    // đúng có 1 công đoạn khớp — bomItemId/itemId/completedQuantity/plannedQuantity (đều NOT NULL)
    // chắc chắn có giá trị.
    const operationId = row.operationId;
    const itemId = row.itemId;
    const quantity = row.completedQuantity!;

    const [inspectedByBomItem, inspectedByOperation] = await Promise.all([
      getInspectedQuantityByBomItemId(this.db, row.bomItemId!),
      getInspectedQuantityByOperationId(this.db, operationId),
    ]);

    // Σ SL đã xin QC của mọi công đoạn as-used cùng node BOM (1 node có thể nhiều bước, cùng 1 part
    // vật lý) + lô mới không vượt `plannedQuantity` đã đóng băng của node.
    if (inspectedByBomItem + quantity > row.plannedQuantity!) {
      throw new AppException(ErrorCode.E176, HttpStatus.BAD_REQUEST);
    }

    // `quantity` luôn là toàn bộ `completedQuantity`, không phải một phần — nên còn dòng nào đã xin
    // QC trước đó cho đúng công đoạn này (`inspectedByOperation > 0`) nghĩa là xin lại lần hai, chắc
    // chắn vượt trần.
    if (inspectedByOperation > 0) {
      throw new AppException(ErrorCode.E198, HttpStatus.BAD_REQUEST);
    }

    await this.db.transaction(async (tx) => {
      const inspectionDate = new Date();
      const code = await this.generateOqcCode(tx, inspectionDate);

      await tx.insert(qualityInspections).values({
        quantity,
        inspectionDate,
        note: null,
        code,
        kind: QcKind.OUTGOING,
        productionJobOperationId: operationId,
        productionJobId: jobId,
        itemId,
        createdBy: userId,
      });
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
      .update(qualityInspections)
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
      .where(eq(qualityInspections.id, oqcId));
  }

  async deleteOqc(oqcId: string): Promise<void> {
    const inspection = await this.db.query.qualityInspections.findFirst({
      columns: { status: true },
      where: and(
        eq(qualityInspections.kind, QcKind.OUTGOING),
        eq(qualityInspections.id, oqcId),
      ),
    });

    if (!inspection) {
      throw new AppException(ErrorCode.E174, HttpStatus.NOT_FOUND);
    }
    if (inspection.status !== OqcStatus.NOT_INSPECTED) {
      throw new AppException(ErrorCode.E178, HttpStatus.CONFLICT);
    }

    await this.db
      .delete(qualityInspections)
      .where(eq(qualityInspections.id, oqcId));
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

  private async ensureOqcConfirmable(oqcId: string): Promise<{
    quantity: number;
    confirmedAt: Date | null;
    resolvedAt: Date | null;
  }> {
    const inspection = await this.db.query.qualityInspections.findFirst({
      columns: {
        quantity: true,
        confirmedAt: true,
        resolvedAt: true,
        status: true,
      },
      where: and(
        eq(qualityInspections.kind, QcKind.OUTGOING),
        eq(qualityInspections.id, oqcId),
      ),
    });

    if (!inspection) {
      throw new AppException(ErrorCode.E174, HttpStatus.NOT_FOUND);
    }
    if (inspection.status === OqcStatus.COMPLETED) {
      throw new AppException(ErrorCode.E177, HttpStatus.CONFLICT);
    }

    return inspection;
  }

  private async generateOqcCode(
    tx: DbTransaction,
    inspectionDate: Date,
  ): Promise<string> {
    const year = inspectionDate.getFullYear();
    const sequence = await generateDocumentSequence(tx, DocumentType.OQC, year);

    return `OQC-${year}-${String(sequence).padStart(5, '0')}`;
  }
}
