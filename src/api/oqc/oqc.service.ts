import { HttpStatus, Inject, Injectable, StreamableFile } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import {
  and,
  count,
  sql,
  desc,
  eq,
  getTableColumns,
  gte,
  lt,
  or,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { OffsetPaginationDto } from '../../common/dto/offset-pagination/offset-pagination.dto';
import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { buildXlsxBuffer, XLSX_MIME } from '../../common/utils/excel.util';
import { unaccentILike } from '../../common/utils/search.util';
import {
  exclusiveEndOfDay,
  getFileTimestamp,
  startOfVnDay,
} from '../../common/utils/time';
import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import type { Database, DbTransaction } from '../../database/database.type';
import {
  files,
  IqcResult,
  items,
  OqcDisposition,
  OqcStatus,
  orders,
  productionJobBomItems,
  productionJobOperations,
  productionJobs,
  productionOrders,
  ProductionJobStatus,
  QualityEvidenceKind,
  QualityInspectionDecision,
  QualityInspectionStatus,
  QualityInspectionType,
  qualityInspectionResults,
  qualityInspections,
  units,
  users,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { FilesService } from '../files/files.service';
import { createProductionReceiptForJob } from '../inventory-receipts/inventory-receipts.write';
import { linkQcFiles } from '../iqc/iqc.write';
import {
  getNcrRefById,
  getNcrRefsByQualityInspectionId,
} from '../ncrs/ncrs.query';
import { closeNcrAfterOqc, createNcrFromOqc } from '../ncrs/ncrs.write';
import { mapToQualityInspectionStatus } from '../iqc/quality-inspection-status.util';
import { ConfirmOqcReqDto } from './dto/confirm-oqc.req.dto';
import { ExportOqcReqDto } from './dto/export-oqc.req.dto';
import { GetOqcsReqDto } from './dto/get-oqcs.req.dto';
import { OqcResDto } from './dto/oqc.res.dto';
import { PageOqcResDto } from './dto/page-oqc.res.dto';
import { RequestJobOqcReqDto } from './dto/request-job-oqc.req.dto';
import { OQC_EXPORT_COLUMNS } from './oqc.export';
import {
  closeJobIfQcCovered,
  generateOqcCode,
  getInspectedQuantityByBomItemId,
  getInspectedQuantityByOperationId,
  getJobFinalOperation,
  getPassedOqcQuantityByJobId,
} from './oqc.query';

const creatorUsers = alias(users, 'oqc_creator');
const confirmerUsers = alias(users, 'oqc_confirmer');
const resolverUsers = alias(users, 'oqc_resolver');

@Injectable()
export class OqcService {
  private static readonly MAX_EXPORT_ROWS = 10_000;

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly filesService: FilesService,
  ) {}

  async getOqcs(
    reqDto: GetOqcsReqDto,
  ): Promise<OffsetPaginatedDto<PageOqcResDto>> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;

    const where = and(
      eq(qualityInspections.inspectionType, QualityInspectionType.OQC),
      keyword
        ? or(
            unaccentILike(qualityInspections.inspectionNo, keyword),
            unaccentILike(items.code, keyword),
            unaccentILike(productionJobs.itemRevision, keyword),
            unaccentILike(items.name, keyword),
            unaccentILike(orders.code, keyword),
            unaccentILike(orders.buyerPoNo, keyword),
          )
        : undefined,
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
      reqDto.result
        ? eq(
            qualityInspections.decision,
            reqDto.result as string as QualityInspectionDecision,
          )
        : undefined,
      reqDto.status ? eq(qualityInspections.status, reqDto.status) : undefined,
      reqDto.disposition
        ? eq(qualityInspections.disposition, reqDto.disposition)
        : undefined,
      reqDto.startDate
        ? gte(qualityInspections.requestedAt, startOfVnDay(reqDto.startDate))
        : undefined,
      reqDto.endDate
        ? lt(qualityInspections.requestedAt, exclusiveEndOfDay(reqDto.endDate))
        : undefined,
    );

    // Công đoạn/node BOM dùng `innerJoin` vì `chk_quality_inspections_oqc_job` bắt mọi dòng OQC
    // có job + công đoạn. `items` join qua `qualityInspections.itemId` (OQC luôn có, `E199`), KHÔNG
    // qua `productionJobBomItems.itemId` (nullable, `set null` khi item gốc bị xoá).
    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select({
          id: qualityInspections.id,
          code: qualityInspections.inspectionNo,
          quantity: qualityInspections.quantity,
          inspectionDate: qualityInspections.requestedAt,
          result: qualityInspections.decision,
          status: qualityInspections.status,
          disposition: qualityInspections.disposition,
          productionJob: getTableColumns(productionJobs),
          orderCode: orders.code,
          buyerPoNo: orders.buyerPoNo,
          ncrAction: productionOrders.ncrAction,
          operation: getTableColumns(productionJobOperations),
          bomItem: getTableColumns(productionJobBomItems),
          item: {
            ...getTableColumns(items),
            revision: productionJobs.itemRevision,
          },
          revision: productionJobs.itemRevision,
          imageFile: getTableColumns(files),
          unit: getTableColumns(units),
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
        .leftJoin(
          files,
          eq(
            files.id,
            sql`coalesce(${productionJobBomItems.imageFileId}, ${items.imageFileId})`,
          ),
        )
        .where(where)
        .orderBy(desc(qualityInspections.createdAt))
        .limit(reqDto.limit)
        .offset(reqDto.offset),
      this.db
        .select({ total: count() })
        .from(qualityInspections)
        .innerJoin(items, eq(items.id, qualityInspections.itemId))
        .innerJoin(
          productionJobs,
          eq(productionJobs.id, qualityInspections.productionJobId),
        )
        .leftJoin(
          productionOrders,
          eq(productionOrders.id, productionJobs.productionOrderId),
        )
        .leftJoin(orders, eq(orders.id, productionOrders.orderId))
        .where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(PageOqcResDto, rows, { excludeExtraneousValues: true }),
      new OffsetPaginationDto(total, reqDto),
    );
  }

  /** Cắt im lặng ở `MAX_EXPORT_ROWS`, không báo lỗi khi vượt trần. Bộ lọc tách riêng khỏi
   * `getOqcs` dù trông giống nhau — hai route độc lập, sửa filter route nào chỉ route đó đổi. */
  async exportOqc(reqDto: ExportOqcReqDto): Promise<StreamableFile> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;

    const where = and(
      eq(qualityInspections.inspectionType, QualityInspectionType.OQC),
      keyword
        ? or(
            unaccentILike(qualityInspections.inspectionNo, keyword),
            unaccentILike(items.code, keyword),
            unaccentILike(productionJobs.itemRevision, keyword),
            unaccentILike(items.name, keyword),
            unaccentILike(orders.code, keyword),
            unaccentILike(orders.buyerPoNo, keyword),
          )
        : undefined,
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
      reqDto.result
        ? eq(
            qualityInspections.decision,
            reqDto.result as string as QualityInspectionDecision,
          )
        : undefined,
      reqDto.status ? eq(qualityInspections.status, reqDto.status) : undefined,
      reqDto.disposition
        ? eq(qualityInspections.disposition, reqDto.disposition)
        : undefined,
      reqDto.startDate
        ? gte(qualityInspections.requestedAt, startOfVnDay(reqDto.startDate))
        : undefined,
      reqDto.endDate
        ? lt(qualityInspections.requestedAt, exclusiveEndOfDay(reqDto.endDate))
        : undefined,
    );

    const rows = await this.db
      .select({
        code: qualityInspections.inspectionNo,
        jobCode: productionJobs.code,
        orderCode: orders.code,
        buyerPoNo: orders.buyerPoNo,
        operationCode: productionJobOperations.code,
        operationName: productionJobOperations.name,
        itemCode: items.code,
        itemRevision: productionJobs.itemRevision,
        itemName: items.name,
        bomItemCode: productionJobBomItems.code,
        bomItemName: productionJobBomItems.name,
        unitName: units.name,
        quantity: qualityInspections.quantity,
        inspectionDate: qualityInspections.requestedAt,
        result: qualityInspections.decision,
        disposition: qualityInspections.disposition,
        status: qualityInspections.status,
        note: qualityInspections.note,
        creatorName: creatorUsers.fullName,
        createdAt: qualityInspections.createdAt,
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
      .leftJoin(
        files,
        eq(
          files.id,
          sql`coalesce(${productionJobBomItems.imageFileId}, ${items.imageFileId})`,
        ),
      )
      .leftJoin(creatorUsers, eq(creatorUsers.id, qualityInspections.createdBy))
      .where(where)
      .orderBy(desc(qualityInspections.createdAt))
      .limit(OqcService.MAX_EXPORT_ROWS);

    const buffer = await buildXlsxBuffer('OQC', OQC_EXPORT_COLUMNS, rows);
    const fileName = `oqc-${getFileTimestamp()}.xlsx`;

    return new StreamableFile(buffer, {
      type: XLSX_MIME,
      disposition: `attachment; filename="${fileName}"`,
    });
  }

  async getOqc(oqcId: string): Promise<OqcResDto> {
    // Cùng khuôn join với `getOqcs`; thêm 3 alias `users` riêng cho `creatorBy`/`confirmerBy`/
    // `resolverBy` (ba FK độc lập trỏ cùng bảng).
    const [oqcInspection] = await this.db
      .select({
        id: qualityInspections.id,
        code: qualityInspections.inspectionNo,
        quantity: qualityInspections.quantity,
        inspectionDate: qualityInspections.requestedAt,
        result: qualityInspections.decision,
        status: qualityInspections.status,
        resultNote: qualityInspections.decisionNote,
        disposition: qualityInspections.disposition,
        dispositionNote: qualityInspections.dispositionNote,
        sortOkQty: qualityInspections.sortOkQty,
        sortNgQty: qualityInspections.sortNgQty,
        confirmedAt: qualityInspections.startedAt,
        resolvedAt: qualityInspections.approvedAt,
        createdAt: qualityInspections.createdAt,
        ncrId: qualityInspections.ncrId,
        productionJob: getTableColumns(productionJobs),
        orderCode: orders.code,
        buyerPoNo: orders.buyerPoNo,
        operation: getTableColumns(productionJobOperations),
        bomItem: getTableColumns(productionJobBomItems),
        item: {
          ...getTableColumns(items),
          revision: productionJobs.itemRevision,
        },
        revision: productionJobs.itemRevision,
        imageFile: getTableColumns(files),
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
      .leftJoin(
        files,
        eq(
          files.id,
          sql`coalesce(${productionJobBomItems.imageFileId}, ${items.imageFileId})`,
        ),
      )
      .leftJoin(creatorUsers, eq(creatorUsers.id, qualityInspections.createdBy))
      .leftJoin(
        confirmerUsers,
        eq(confirmerUsers.id, qualityInspections.inspectedBy),
      )
      .leftJoin(
        resolverUsers,
        eq(resolverUsers.id, qualityInspections.approvedBy),
      )
      .where(
        and(
          eq(qualityInspections.inspectionType, QualityInspectionType.OQC),
          eq(qualityInspections.id, oqcId),
        ),
      )
      .limit(1);

    if (!oqcInspection) {
      throw new AppException(ErrorCode.E174, HttpStatus.NOT_FOUND);
    }

    const [latestEvidences, spawnedNcrs, ncr] = await Promise.all([
      this.getLatestAttemptEvidences(oqcId),
      getNcrRefsByQualityInspectionId(this.db, oqcId),
      oqcInspection.ncrId ? getNcrRefById(this.db, oqcInspection.ncrId) : null,
    ]);

    return plainToInstance(
      OqcResDto,
      {
        ...oqcInspection,
        ncr,
        spawnedNcrs,
        files: latestEvidences,
      },
      { excludeExtraneousValues: true },
    );
  }

  private async getLatestAttemptEvidences(qualityInspectionId: string) {
    const latestAttempt =
      await this.db.query.qualityInspectionResults.findFirst({
        where: eq(
          qualityInspectionResults.qualityInspectionId,
          qualityInspectionId,
        ),
        columns: {},
        with: { evidences: { with: { file: true } } },
        orderBy: desc(qualityInspectionResults.attemptNo),
      });

    return latestAttempt?.evidences ?? [];
  }

  /** "Yêu cầu QC" cấp Job, OQC theo lô một phần: xưởng làm xong bao nhiêu ở công đoạn cuối thì xin
   * kiểm bấy nhiêu, không chờ cả Job.
   *
   * Rules:
   * - Job phải tồn tại (`E082`) và `IN_PROGRESS`/`WAITING_QC` (`E175`).
   * - Cần node Cấp 0 (`itemType = 'FG'`) có công đoạn không `OUTSOURCE` (gia công ngoài chỉ QC qua
   *   IQC), thiếu thì `E213`; và còn `itemId` để snapshot (`E199`).
   * - `quantity` mặc định là toàn bộ SL chưa kiểm; tối đa là SL hoàn thành lũy kế của công đoạn
   *   cuối trừ Σ các lô đã xin (trừ lô `SCRAP`, trả SL về), quá thì `E198`.
   * - Σ lô theo cả node BOM không vượt `plannedQuantity` (`E176`).
   *
   * Phiếu nhập kho TP của lô sinh lúc `confirmOqc`. */
  async createOqcForJob(
    jobId: string,
    reqDto: RequestJobOqcReqDto,
    userId: string,
  ): Promise<void> {
    const finalOperation = await getJobFinalOperation(this.db, jobId);

    if (!finalOperation) {
      throw new AppException(ErrorCode.E082, HttpStatus.NOT_FOUND);
    }

    // Job tự chuyển `WAITING_QC` khi công đoạn Cấp 0 hoàn thành hết — chấp nhận cả hai trạng thái:
    // lô một phần được xin khi Job còn `IN_PROGRESS`.
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

    if (!finalOperation.itemId) {
      throw new AppException(ErrorCode.E199, HttpStatus.CONFLICT);
    }

    // LEFT JOIN làm kiểu nullable, nhưng qua các kiểm trên là đã có đúng 1 công đoạn khớp nên
    // `bomItemId`/`completedQuantity`/`plannedQuantity` (NOT NULL) chắc chắn có giá trị.
    const operationId = finalOperation.operationId;
    const itemId = finalOperation.itemId;

    const [inspectedByBomItem, inspectedByOperation] = await Promise.all([
      getInspectedQuantityByBomItemId(this.db, finalOperation.bomItemId!),
      getInspectedQuantityByOperationId(this.db, operationId),
    ]);

    const requestableQuantity =
      finalOperation.completedQuantity! - inspectedByOperation;
    const quantity = reqDto.quantity ?? requestableQuantity;
    if (quantity <= 0 || quantity > requestableQuantity) {
      throw new AppException(ErrorCode.E198, HttpStatus.BAD_REQUEST);
    }

    // Σ SL đã xin QC của mọi công đoạn cùng node BOM (cùng một part vật lý) + lô mới không vượt
    // `plannedQuantity` đã đóng băng của node.
    if (inspectedByBomItem + quantity > finalOperation.plannedQuantity!) {
      throw new AppException(ErrorCode.E176, HttpStatus.BAD_REQUEST);
    }

    await this.db.transaction(async (tx) => {
      const inspectionDate = new Date();
      const code = await generateOqcCode(tx, inspectionDate);

      await tx.insert(qualityInspections).values({
        quantity,
        requestedAt: inspectionDate,
        inspectionNo: code,
        inspectionType: QualityInspectionType.OQC,
        productionJobOperationId: operationId,
        productionJobId: jobId,
        itemId,
        status: QualityInspectionStatus.DRAFT,
        createdBy: userId,
      });
    });
  }

  /** Nút "Lưu" duy nhất của trang chi tiết OQC — mỗi lần gọi ghi 3 nơi trong 1 transaction: 1 dòng
   * attempt mới (`quality_inspection_results`), mirror trên `quality_inspections`, và đính kèm.
   * `linkFiles` chạy trước khi mở transaction nên `dispositionEvidenceFileIds` vẫn bị
   * validate/stamp `linkedAt` kể cả khi PASS — chỉ dòng `quality_inspection_evidences` bị bỏ qua.
   * Xem `docs/CODEMAPS/quality.md`. */
  async confirmOqc(
    oqcId: string,
    reqDto: ConfirmOqcReqDto,
    userId: string,
  ): Promise<void> {
    const oqcInspection = await this.ensureOqcConfirmable(oqcId);

    const isPass = reqDto.result === IqcResult.PASS;
    const inspectionDate = reqDto.inspectionDate ?? oqcInspection.requestedAt;
    this.validateSortSplit(reqDto, oqcInspection.quantity);
    const disposition = isPass ? null : (reqDto.disposition ?? null);
    const isSort = disposition === OqcDisposition.SORT;
    const decision = {
      decision: reqDto.result,
      decisionNote: reqDto.resultNote ?? null,
      disposition,
      dispositionNote: isPass ? null : (reqDto.dispositionNote ?? null),
      sortOkQty: isSort ? (reqDto.sortOkQty ?? null) : null,
      sortNgQty: isSort ? (reqDto.sortNgQty ?? null) : null,
    };
    const status = this.resolveOqcStatus(decision.decision, reqDto.disposition);
    const dbStatus = mapToQualityInspectionStatus(status);
    // `IqcResult` (PASS/FAIL) hẹp hơn enum cột `decision` (`quality_inspection_decision`) — ép kiểu
    // tại 2 điểm ghi dưới, giữ `decision.decision` kiểu `IqcResult` cho `resolveOqcStatus`/
    // `linkOqcEvidence`.
    const dbDecision = decision.decision as string as QualityInspectionDecision;

    await this.filesService.linkFiles([
      ...(reqDto.qcEvidenceFileIds ?? []),
      ...(reqDto.dispositionEvidenceFileIds ?? []),
    ]);

    await this.db.transaction(async (tx) => {
      const lockedOqcInspection = await this.getOqcInspectionForUpdate(
        tx,
        oqcId,
      );
      const attemptNo = lockedOqcInspection.attemptCount + 1;
      const audit = this.buildConfirmAudit(
        lockedOqcInspection,
        decision.disposition,
        userId,
      );

      const [attempt] = await tx
        .insert(qualityInspectionResults)
        .values({
          ...decision,
          decision: dbDecision,
          qualityInspectionId: oqcId,
          inspectionType: QualityInspectionType.OQC,
          quantity: oqcInspection.quantity,
          attemptNo,
          inspectedAt: inspectionDate,
          resultingStatus: dbStatus,
          inspectedBy: userId,
        })
        .returning({ id: qualityInspectionResults.id });

      await tx
        .update(qualityInspections)
        .set({
          ...decision,
          decision: dbDecision,
          requestedAt: inspectionDate,
          status: dbStatus,
          attemptCount: attemptNo,
          ...audit,
        })
        .where(eq(qualityInspections.id, oqcId));

      await this.linkOqcEvidence(tx, attempt.id, reqDto, decision.decision);

      // Job đứng yên ở `WAITING_QC` cho tới khi QC xử lý xong hết (không chỉ lần confirm này):
      // `closeJobIfQcCovered` đếm lại toàn bộ dòng QC của Job. Ghi thẳng bằng drizzle, không qua
      // `ProductionJobsService` — tránh vòng import (`production-jobs` đã import `oqc`).
      if (
        status === OqcStatus.COMPLETED &&
        lockedOqcInspection.productionJobId
      ) {
        // Lô vừa đạt vào kho ngay, không chờ cả Job: phiếu nhập TP cho phần chênh giữa Σ SL OQC
        // đạt và SL đã có phiếu (lô `SCRAP` không đổi Σ nên không sinh gì).
        await createProductionReceiptForJob(
          tx,
          lockedOqcInspection.productionJobId,
          userId,
          await getPassedOqcQuantityByJobId(
            tx,
            lockedOqcInspection.productionJobId,
          ),
        );
        await closeJobIfQcCovered(
          tx,
          lockedOqcInspection.productionJobId,
          userId,
        );
      }

      if (status === OqcStatus.COMPLETED) {
        await closeNcrAfterOqc(tx, oqcId, userId);
      }

      // Sàng lọc có hàng NG: phần NG chuyển sang NCR-NB để QC/Giám đốc quyết định hướng xử lý.
      if (
        isSort &&
        lockedOqcInspection.productionJobId &&
        (decision.sortNgQty ?? 0) > 0
      ) {
        await createNcrFromOqc(tx, {
          qualityInspectionId: oqcId,
          productionJobId: lockedOqcInspection.productionJobId,
          ngQty: decision.sortNgQty ?? 0,
          defectDescription: decision.dispositionNote,
          userId,
        });
      }
    });
  }

  /** Khoá dòng để cấp `attemptNo` tuần tự — không có lock, hai lần confirm song song có thể tính
   * trùng `attemptNo` hoặc cùng nghĩ mình là lần đầu. Đây là chốt chặn thật cho `E177`
   * (`COMPLETED`) — `ensureOqcConfirmable` chỉ fail-fast trước transaction, không thay được lock
   * này. */
  private async getOqcInspectionForUpdate(
    tx: DbTransaction,
    oqcId: string,
  ): Promise<{
    startedAt: Date | null;
    approvedAt: Date | null;
    attemptCount: number;
    productionJobId: string | null;
  }> {
    const [oqcInspection] = await tx
      .select({
        startedAt: qualityInspections.startedAt,
        approvedAt: qualityInspections.approvedAt,
        status: qualityInspections.status,
        attemptCount: qualityInspections.attemptCount,
        productionJobId: qualityInspections.productionJobId,
      })
      .from(qualityInspections)
      .where(eq(qualityInspections.id, oqcId))
      .for('update');

    if (
      !oqcInspection ||
      oqcInspection.status === QualityInspectionStatus.COMPLETED
    ) {
      throw new AppException(ErrorCode.E177, HttpStatus.CONFLICT);
    }

    return oqcInspection;
  }

  /** Bỏ trống (`undefined`) = Drizzle giữ nguyên cột: người/lúc confirm chỉ ghi ở lần confirm đầu
   * tiên, người/lúc chốt phương án chỉ ghi ở lần chốt đầu tiên — nhưng bị xoá hẳn nếu lần confirm
   * này không còn phương án nào. */
  private buildConfirmAudit(
    lockedOqcInspection: { startedAt: Date | null; approvedAt: Date | null },
    disposition: OqcDisposition | null,
    userId: string,
  ): {
    inspectedBy?: string;
    startedAt?: Date;
    approvedBy?: string | null;
    approvedAt?: Date | null;
  } {
    const audit: {
      inspectedBy?: string;
      startedAt?: Date;
      approvedBy?: string | null;
      approvedAt?: Date | null;
    } = {};

    if (lockedOqcInspection.startedAt === null) {
      audit.inspectedBy = userId;
      audit.startedAt = new Date();
    }

    if (!disposition) {
      audit.approvedBy = null;
      audit.approvedAt = null;
    } else if (lockedOqcInspection.approvedAt === null) {
      audit.approvedBy = userId;
      audit.approvedAt = new Date();
    }

    return audit;
  }

  private async linkOqcEvidence(
    tx: DbTransaction,
    qualityInspectionResultId: string,
    reqDto: ConfirmOqcReqDto,
    result: IqcResult,
  ): Promise<void> {
    await linkQcFiles(
      tx,
      qualityInspectionResultId,
      QualityEvidenceKind.QC_EVIDENCE,
      reqDto.qcEvidenceFileIds ?? [],
    );
    await linkQcFiles(
      tx,
      qualityInspectionResultId,
      QualityEvidenceKind.DISPOSITION_EVIDENCE,
      result === IqcResult.PASS
        ? []
        : (reqDto.dispositionEvidenceFileIds ?? []),
    );
  }

  async deleteOqc(oqcId: string): Promise<void> {
    const oqcInspection = await this.db.query.qualityInspections.findFirst({
      columns: { status: true },
      where: and(
        eq(qualityInspections.inspectionType, QualityInspectionType.OQC),
        eq(qualityInspections.id, oqcId),
      ),
    });

    if (!oqcInspection) {
      throw new AppException(ErrorCode.E174, HttpStatus.NOT_FOUND);
    }
    if (oqcInspection.status !== QualityInspectionStatus.DRAFT) {
      throw new AppException(ErrorCode.E178, HttpStatus.CONFLICT);
    }

    await this.db
      .delete(qualityInspections)
      .where(eq(qualityInspections.id, oqcId));
  }

  /** Cùng luật với IQC (`E160`/`E161`/`E162`): SL OK/NG chỉ đi kèm `SORT`, bắt buộc cả hai khi
   * `SORT`, và cộng đúng SL lô. */
  private validateSortSplit(reqDto: ConfirmOqcReqDto, quantity: number): void {
    const hasSplit = reqDto.sortOkQty != null || reqDto.sortNgQty != null;
    const isSort =
      reqDto.result === IqcResult.FAIL &&
      reqDto.disposition === OqcDisposition.SORT;

    if (!isSort) {
      if (hasSplit && reqDto.result === IqcResult.FAIL) {
        throw new AppException(ErrorCode.E161, HttpStatus.BAD_REQUEST);
      }
      return;
    }

    if (reqDto.sortOkQty == null || reqDto.sortNgQty == null) {
      throw new AppException(ErrorCode.E162, HttpStatus.BAD_REQUEST);
    }

    const scale = (value: number) => Math.round(value * 1000);
    if (scale(reqDto.sortOkQty) + scale(reqDto.sortNgQty) !== scale(quantity)) {
      throw new AppException(ErrorCode.E160, HttpStatus.BAD_REQUEST);
    }
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
  ): Promise<{ quantity: number; requestedAt: Date }> {
    const oqcInspection = await this.db.query.qualityInspections.findFirst({
      columns: { quantity: true, requestedAt: true, status: true },
      where: and(
        eq(qualityInspections.inspectionType, QualityInspectionType.OQC),
        eq(qualityInspections.id, oqcId),
      ),
    });

    if (!oqcInspection) {
      throw new AppException(ErrorCode.E174, HttpStatus.NOT_FOUND);
    }
    if (oqcInspection.status === QualityInspectionStatus.COMPLETED) {
      throw new AppException(ErrorCode.E177, HttpStatus.CONFLICT);
    }

    return oqcInspection;
  }
}
