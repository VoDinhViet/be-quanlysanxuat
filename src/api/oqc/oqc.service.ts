import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import {
  and,
  count,
  desc,
  eq,
  getTableColumns,
  gte,
  isNull,
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
  IqcInspectionLevel,
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
  qcInspections,
  QcFileKind,
  QcKind,
  qcRequests,
  units,
  users,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { FilesService } from '../files/files.service';
import { AqlPlanResDto } from '../iqc/dto/aql-plan.res.dto';
import { GetAqlPlanReqDto } from '../iqc/dto/get-aql-plan.req.dto';
import type { AqlPlan } from '../iqc/iqc-aql.constant';
import { resolveAqlResult } from '../iqc/iqc-aql.constant';
import { resolveAqlPlan } from '../iqc/iqc-aql.query';
import { linkQcFiles } from '../iqc/iqc.write';
import { ConfirmOqcReqDto } from './dto/confirm-oqc.req.dto';
import { GetOqcsReqDto } from './dto/get-oqcs.req.dto';
import { OqcResDto } from './dto/oqc.res.dto';
import { PageOqcResDto } from './dto/page-oqc.res.dto';
import {
  closeJobIfQcCovered,
  getInspectedQuantityByBomItemId,
  getInspectedQuantityByOperationId,
} from './oqc.query';

@Injectable()
export class OqcService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly filesService: FilesService,
  ) {}

  async getOqcs(
    reqDto: GetOqcsReqDto,
  ): Promise<OffsetPaginatedDto<PageOqcResDto>> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;

    const where = and(
      eq(qcRequests.kind, QcKind.OUTGOING),
      keyword ? unaccentILike(qcRequests.code, keyword) : undefined,
      reqDto.productionJobId
        ? eq(qcRequests.productionJobId, reqDto.productionJobId)
        : undefined,
      reqDto.productionJobOperationId
        ? eq(
            qcRequests.productionJobOperationId,
            reqDto.productionJobOperationId,
          )
        : undefined,
      reqDto.itemId ? eq(qcRequests.itemId, reqDto.itemId) : undefined,
      reqDto.result ? eq(qcRequests.result, reqDto.result) : undefined,
      reqDto.status ? eq(qcRequests.status, reqDto.status) : undefined,
      reqDto.disposition
        ? eq(qcRequests.disposition, reqDto.disposition)
        : undefined,
      reqDto.startDate
        ? gte(qcRequests.inspectionDate, reqDto.startDate)
        : undefined,
      reqDto.endDate
        ? lt(
            qcRequests.inspectionDate,
            new Date(reqDto.endDate.getTime() + 24 * 60 * 60 * 1000),
          )
        : undefined,
    );

    // Một `.select()` phẳng — join tường minh thay vì `db.query` quan hệ + hydrate riêng
    // (`docs/decisions/qc-single-table.md`). `productionJobOperations`/`productionJobBomItems`/
    // `items` dùng `innerJoin` — `chk_qc_requests_outgoing_job` đảm bảo mọi dòng `kind = OUTGOING`
    // (đã lọc ở `where`) luôn có cả hai, nên Drizzle tự suy kiểu non-null, không cần assertion.
    // `items` chỉ join để lấy `unitId` (cột `unit` bên dưới) — không select nguyên `item`, danh
    // sách không có cột nào cần nó (`getOqc` mới trả `item` đầy đủ). Join qua `qcRequests.itemId`
    // (snapshot riêng, `NOT NULL`) — KHÔNG PHẢI `productionJobBomItems.itemId` (cột đó nullable,
    // `bomItem` chỉ cho `code`/`name`).
    const [rows, countRows] = await Promise.all([
      this.db
        .select({
          id: qcRequests.id,
          code: qcRequests.code,
          quantity: qcRequests.quantity,
          inspectionDate: qcRequests.inspectionDate,
          result: qcRequests.result,
          status: qcRequests.status,
          disposition: qcRequests.disposition,
          productionJob: getTableColumns(productionJobs),
          orderCode: orders.code,
          operation: getTableColumns(productionJobOperations),
          bomItem: getTableColumns(productionJobBomItems),
          unit: getTableColumns(units),
        })
        .from(qcRequests)
        .innerJoin(
          productionJobs,
          eq(productionJobs.id, qcRequests.productionJobId),
        )
        .leftJoin(
          productionOrders,
          eq(productionOrders.id, productionJobs.productionOrderId),
        )
        .leftJoin(orders, eq(orders.id, productionOrders.orderId))
        .innerJoin(
          productionJobOperations,
          eq(productionJobOperations.id, qcRequests.productionJobOperationId),
        )
        .innerJoin(
          productionJobBomItems,
          eq(
            productionJobBomItems.id,
            productionJobOperations.productionJobBomItemId,
          ),
        )
        .innerJoin(items, eq(items.id, qcRequests.itemId))
        .innerJoin(units, eq(units.id, items.unitId))
        .where(where)
        .orderBy(desc(qcRequests.createdAt))
        .limit(reqDto.limit)
        .offset(reqDto.offset),
      this.db.select({ total: count() }).from(qcRequests).where(where),
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
    // (`chk_qc_requests_outgoing_job` đảm bảo non-null cho `kind = OUTGOING`), 3 alias `users` riêng
    // cho `creatorBy`/`confirmerBy`/`resolverBy` (ba FK độc lập, cùng bảng đích).
    const creatorUsers = alias(users, 'oqc_creator');
    const confirmerUsers = alias(users, 'oqc_confirmer');
    const resolverUsers = alias(users, 'oqc_resolver');

    const [oqcRequest] = await this.db
      .select({
        id: qcRequests.id,
        code: qcRequests.code,
        quantity: qcRequests.quantity,
        inspectionDate: qcRequests.inspectionDate,
        inspectionLevel: qcRequests.inspectionLevel,
        aqlLevel: qcRequests.aqlLevel,
        sampleSize: qcRequests.sampleSize,
        defectQty: qcRequests.defectQty,
        result: qcRequests.result,
        status: qcRequests.status,
        resultNote: qcRequests.resultNote,
        disposition: qcRequests.disposition,
        dispositionNote: qcRequests.dispositionNote,
        confirmedAt: qcRequests.confirmedAt,
        resolvedAt: qcRequests.resolvedAt,
        createdAt: qcRequests.createdAt,
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
      .from(qcRequests)
      .innerJoin(
        productionJobs,
        eq(productionJobs.id, qcRequests.productionJobId),
      )
      .leftJoin(
        productionOrders,
        eq(productionOrders.id, productionJobs.productionOrderId),
      )
      .leftJoin(orders, eq(orders.id, productionOrders.orderId))
      .innerJoin(
        productionJobOperations,
        eq(productionJobOperations.id, qcRequests.productionJobOperationId),
      )
      .innerJoin(
        productionJobBomItems,
        eq(
          productionJobBomItems.id,
          productionJobOperations.productionJobBomItemId,
        ),
      )
      .innerJoin(items, eq(items.id, qcRequests.itemId))
      .innerJoin(units, eq(units.id, items.unitId))
      .leftJoin(creatorUsers, eq(creatorUsers.id, qcRequests.createdBy))
      .leftJoin(confirmerUsers, eq(confirmerUsers.id, qcRequests.confirmedBy))
      .leftJoin(resolverUsers, eq(resolverUsers.id, qcRequests.resolvedBy))
      .where(
        and(eq(qcRequests.kind, QcKind.OUTGOING), eq(qcRequests.id, oqcId)),
      )
      .limit(1);

    if (!oqcRequest) {
      throw new AppException(ErrorCode.E174, HttpStatus.NOT_FOUND);
    }

    const latestAttempt = await this.getLatestAttempt(oqcId);

    return plainToInstance(
      OqcResDto,
      {
        ...oqcRequest,
        files: latestAttempt?.files ?? [],
      },
      { excludeExtraneousValues: true },
    );
  }

  private async getLatestAttempt(qcRequestId: string) {
    return this.db.query.qcInspections.findFirst({
      where: eq(qcInspections.qcRequestId, qcRequestId),
      columns: {},
      with: { files: { with: { file: true } } },
      orderBy: desc(qcInspections.attemptNo),
    });
  }

  /** "Yêu cầu QC" cấp Job — 1 cú bấm, không cần nhập gì. Một câu `SELECT` gộp phần lớn điều kiện:
   * Job tồn tại + `IN_PROGRESS` (`E082`/`E175`), có node Cấp 0 hợp lệ (`itemType='FG'`, `type ≠
   * OUTSOURCE` — gia công ngoài chỉ QC qua IQC, không qua OQC, thiếu thì `E213`), còn `itemId` để
   * snapshot (`E199`). Node Cấp 0 có thể nhiều công đoạn (BUG-079) nên `completedDate` của riêng
   * dòng `sortOrder` cao nhất không đại diện được cả node — readiness (`E214`) đếm lại RIÊNG, xem
   * mọi công đoạn FG (không OUTSOURCE) của Job còn dòng nào chưa `completedDate` không. `uq_
   * production_job_bom_items_final_assembly` đảm bảo tối đa 1 node Cấp 0/Job. Hai `LEFT JOIN`
   * (không phải `INNER`) để phân biệt đúng "Job không tồn tại" khỏi "Job tồn tại nhưng thiếu
   * node/công đoạn hợp lệ" — cả hai ca sau vẫn phải trả về 1 dòng, không phải 0. `quantity` lấy
   * thẳng `completedQuantity` của công đoạn `sortOrder` cao nhất (bước cuối cùng của node) — lô
   * kiểm luôn là toàn bộ SL đã hoàn thành, không phải một phần. */
  async createOqcForJob(jobId: string, userId: string): Promise<void> {
    const [finalOperation] = await this.db
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

    if (!finalOperation) {
      throw new AppException(ErrorCode.E082, HttpStatus.NOT_FOUND);
    }

    // Job đã tự chuyển `WAITING_QC` ngay khi công đoạn Cấp 0 hoàn thành (cùng transaction sinh ra
    // `completedDate` ở dưới) — chấp nhận cả hai để không khoá Job cũ (trước bản vá này) còn đứng ở
    // `IN_PROGRESS`. Xem `docs/decisions/production-lifecycle-closing.md`.
    const allowedJobStatuses: ProductionJobStatus[] = [
      ProductionJobStatus.IN_PROGRESS,
      ProductionJobStatus.WAITING_QC,
    ];
    if (!allowedJobStatuses.includes(finalOperation.jobStatus)) {
      throw new AppException(ErrorCode.E175, HttpStatus.CONFLICT);
    }

    if (!finalOperation.operationId) {
      throw new AppException(ErrorCode.E213, HttpStatus.BAD_REQUEST);
    }

    const [{ pendingFinalAssemblyCount }] = await this.db
      .select({ pendingFinalAssemblyCount: count() })
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
          eq(productionJobBomItems.productionJobId, jobId),
          eq(productionJobBomItems.itemType, ItemType.FG),
          ne(productionJobOperations.type, OperationType.OUTSOURCE),
          isNull(productionJobOperations.completedDate),
        ),
      );

    if (pendingFinalAssemblyCount > 0) {
      throw new AppException(ErrorCode.E214, HttpStatus.BAD_REQUEST);
    }

    if (!finalOperation.itemId) {
      throw new AppException(ErrorCode.E199, HttpStatus.CONFLICT);
    }

    // LEFT JOIN khiến các cột trên khiến kiểu nullable, nhưng đã qua đủ 4 kiểm phía trên nghĩa là
    // đúng có 1 công đoạn khớp — bomItemId/itemId/completedQuantity/plannedQuantity (đều NOT NULL)
    // chắc chắn có giá trị.
    const operationId = finalOperation.operationId;
    const itemId = finalOperation.itemId;
    const quantity = finalOperation.completedQuantity!;

    const [inspectedByBomItem, inspectedByOperation] = await Promise.all([
      getInspectedQuantityByBomItemId(this.db, finalOperation.bomItemId!),
      getInspectedQuantityByOperationId(this.db, operationId),
    ]);

    // Σ SL đã xin QC của mọi công đoạn as-used cùng node BOM (1 node có thể nhiều bước, cùng 1 part
    // vật lý) + lô mới không vượt `plannedQuantity` đã đóng băng của node.
    if (inspectedByBomItem + quantity > finalOperation.plannedQuantity!) {
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

      await tx.insert(qcRequests).values({
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

  async getAqlPlan(reqDto: GetAqlPlanReqDto): Promise<AqlPlanResDto> {
    const plan = await resolveAqlPlan(
      this.db,
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

  /** Nút "Lưu" duy nhất của trang chi tiết OQC — mỗi lần gọi ghi 3 nơi trong 1 transaction: 1 dòng
   * attempt mới (`qc_inspections`), mirror trên `qc_requests`, và đính kèm. `linkFiles` chạy trước
   * khi mở transaction (`.claude/rules/transactions.md`) nên `dispositionEvidenceFileIds` vẫn bị
   * validate/stamp `linkedAt` kể cả khi PASS — chỉ dòng `qc_files` bị bỏ qua. Xem
   * `docs/workflows/final-qc.md`. */
  async confirmOqc(
    oqcId: string,
    reqDto: ConfirmOqcReqDto,
    userId: string,
  ): Promise<void> {
    const oqcRequest = await this.ensureOqcConfirmable(oqcId);

    const plan = await resolveAqlPlan(
      this.db,
      oqcRequest.quantity,
      reqDto.inspectionLevel,
      reqDto.aqlLevel,
    );
    const decision = this.buildOqcDecision(reqDto, plan);
    const status = this.resolveOqcStatus(decision.result, reqDto.disposition);

    await this.filesService.linkFiles([
      ...(reqDto.qcEvidenceFileIds ?? []),
      ...(reqDto.dispositionEvidenceFileIds ?? []),
    ]);

    await this.db.transaction(async (tx) => {
      const lockedOqcRequest = await this.getOqcRequestForUpdate(tx, oqcId);
      const attemptNo = lockedOqcRequest.attemptCount + 1;
      const audit = this.buildConfirmAudit(
        lockedOqcRequest,
        decision.disposition,
        userId,
      );

      const [attempt] = await tx
        .insert(qcInspections)
        .values({
          ...decision,
          qcRequestId: oqcId,
          kind: QcKind.OUTGOING,
          quantity: oqcRequest.quantity,
          attemptNo,
          inspectionDate: oqcRequest.inspectionDate,
          resultingStatus: status,
          confirmedBy: userId,
        })
        .returning({ id: qcInspections.id });

      await tx
        .update(qcRequests)
        .set({
          ...decision,
          status,
          attemptCount: attemptNo,
          ...audit,
        })
        .where(eq(qcRequests.id, oqcId));

      await this.linkOqcEvidence(tx, attempt.id, reqDto, decision.result);

      // Job đứng yên ở `WAITING_QC` cho tới khi QC xử lý xong hết (không chỉ lần confirm này) —
      // `closeJobIfQcCovered` đếm lại toàn bộ dòng QC của Job (IQC lẫn OQC), mở khoá khi hết dở
      // dang. Ghi thẳng bằng drizzle, không qua `ProductionJobsService` — tránh vòng import
      // (`production-jobs` đã import `oqc`). Xem `docs/decisions/production-lifecycle-closing.md`.
      if (status === OqcStatus.COMPLETED && lockedOqcRequest.productionJobId) {
        await closeJobIfQcCovered(tx, lockedOqcRequest.productionJobId);
      }
    });
  }

  /** `result` vắng thì lấy `resultAuto` (suy từ Ac/Re) — cả hai đều vắng thì `E200`, ném ngay ở
   * đây trước khi có bất kỳ ghi nào. `resultAuto` chỉ dùng cục bộ để suy `result`, không lưu
   * xuống DB — không có route/query nào đọc lại nó (khác `ac`/`re` mà IQC vẫn đọc lại cho dòng
   * `INCOMING` của nó, xem `IqcService.getIqc`), nên không có snapshot nào để giữ. */
  private buildOqcDecision(
    reqDto: ConfirmOqcReqDto,
    plan: AqlPlan | undefined,
  ): {
    inspectionLevel: IqcInspectionLevel;
    aqlLevel: number;
    sampleSize: number | null;
    defectQty: number;
    result: IqcResult;
    resultNote: string | null;
    disposition: OqcDisposition | null;
    dispositionNote: string | null;
  } {
    const resultAuto = plan ? resolveAqlResult(plan, reqDto.defectQty) : null;
    const result = reqDto.result ?? resultAuto;

    if (!result) {
      throw new AppException(ErrorCode.E200, HttpStatus.BAD_REQUEST);
    }

    const isPass = result === IqcResult.PASS;

    return {
      inspectionLevel: reqDto.inspectionLevel,
      aqlLevel: reqDto.aqlLevel,
      sampleSize: reqDto.sampleSize ?? null,
      defectQty: reqDto.defectQty,
      result,
      resultNote: reqDto.resultNote ?? null,
      disposition: isPass ? null : (reqDto.disposition ?? null),
      dispositionNote: isPass ? null : (reqDto.dispositionNote ?? null),
    };
  }

  /** Khoá dòng để cấp `attemptNo` tuần tự — không có lock, hai lần confirm song song có thể tính
   * trùng `attemptNo` hoặc cùng nghĩ mình là lần đầu. Đây là chốt chặn thật cho `E177`
   * (`COMPLETED`) — `ensureOqcConfirmable` chỉ fail-fast trước transaction, không thay được lock
   * này. */
  private async getOqcRequestForUpdate(
    tx: DbTransaction,
    oqcId: string,
  ): Promise<{
    confirmedAt: Date | null;
    resolvedAt: Date | null;
    attemptCount: number;
    productionJobId: string | null;
  }> {
    const [oqcRequest] = await tx
      .select({
        confirmedAt: qcRequests.confirmedAt,
        resolvedAt: qcRequests.resolvedAt,
        status: qcRequests.status,
        attemptCount: qcRequests.attemptCount,
        productionJobId: qcRequests.productionJobId,
      })
      .from(qcRequests)
      .where(eq(qcRequests.id, oqcId))
      .for('update');

    if (!oqcRequest || oqcRequest.status === OqcStatus.COMPLETED) {
      throw new AppException(ErrorCode.E177, HttpStatus.CONFLICT);
    }

    return oqcRequest;
  }

  /** Bỏ trống (`undefined`) = Drizzle giữ nguyên cột: người/lúc confirm chỉ ghi ở lần confirm đầu
   * tiên, người/lúc chốt phương án chỉ ghi ở lần chốt đầu tiên — nhưng bị xoá hẳn nếu lần confirm
   * này không còn phương án nào. */
  private buildConfirmAudit(
    lockedOqcRequest: { confirmedAt: Date | null; resolvedAt: Date | null },
    disposition: OqcDisposition | null,
    userId: string,
  ): {
    confirmedBy?: string;
    confirmedAt?: Date;
    resolvedBy?: string | null;
    resolvedAt?: Date | null;
  } {
    const audit: {
      confirmedBy?: string;
      confirmedAt?: Date;
      resolvedBy?: string | null;
      resolvedAt?: Date | null;
    } = {};

    if (lockedOqcRequest.confirmedAt === null) {
      audit.confirmedBy = userId;
      audit.confirmedAt = new Date();
    }

    if (!disposition) {
      audit.resolvedBy = null;
      audit.resolvedAt = null;
    } else if (lockedOqcRequest.resolvedAt === null) {
      audit.resolvedBy = userId;
      audit.resolvedAt = new Date();
    }

    return audit;
  }

  private async linkOqcEvidence(
    tx: DbTransaction,
    inspectionId: string,
    reqDto: ConfirmOqcReqDto,
    result: IqcResult,
  ): Promise<void> {
    await linkQcFiles(
      tx,
      inspectionId,
      QcFileKind.QC_EVIDENCE,
      reqDto.qcEvidenceFileIds ?? [],
    );
    await linkQcFiles(
      tx,
      inspectionId,
      QcFileKind.DISPOSITION_EVIDENCE,
      result === IqcResult.PASS
        ? []
        : (reqDto.dispositionEvidenceFileIds ?? []),
    );
  }

  async deleteOqc(oqcId: string): Promise<void> {
    const oqcRequest = await this.db.query.qcRequests.findFirst({
      columns: { status: true },
      where: and(
        eq(qcRequests.kind, QcKind.OUTGOING),
        eq(qcRequests.id, oqcId),
      ),
    });

    if (!oqcRequest) {
      throw new AppException(ErrorCode.E174, HttpStatus.NOT_FOUND);
    }
    if (oqcRequest.status !== OqcStatus.NOT_INSPECTED) {
      throw new AppException(ErrorCode.E178, HttpStatus.CONFLICT);
    }

    await this.db.delete(qcRequests).where(eq(qcRequests.id, oqcId));
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

  private async ensureOqcConfirmable(
    oqcId: string,
  ): Promise<{ quantity: number; inspectionDate: Date }> {
    const oqcRequest = await this.db.query.qcRequests.findFirst({
      columns: { quantity: true, inspectionDate: true, status: true },
      where: and(
        eq(qcRequests.kind, QcKind.OUTGOING),
        eq(qcRequests.id, oqcId),
      ),
    });

    if (!oqcRequest) {
      throw new AppException(ErrorCode.E174, HttpStatus.NOT_FOUND);
    }
    if (oqcRequest.status === OqcStatus.COMPLETED) {
      throw new AppException(ErrorCode.E177, HttpStatus.CONFLICT);
    }

    return oqcRequest;
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
