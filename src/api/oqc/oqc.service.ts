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
  IqcAttachmentKind,
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
  QcKind,
  qcRequests,
  units,
  users,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { FilesService } from '../files/files.service';
import { AqlPlanResDto } from '../iqc/dto/aql-plan.res.dto';
import { GetAqlPlanReqDto } from '../iqc/dto/get-aql-plan.req.dto';
import { resolveAqlResult } from '../iqc/iqc-aql.constant';
import { resolveAqlPlan } from '../iqc/iqc-aql.query';
import { linkAttachments } from '../iqc/iqc.write';
import { ConfirmOqcReqDto } from './dto/confirm-oqc.req.dto';
import { GetOqcsReqDto } from './dto/get-oqcs.req.dto';
import { OqcResDto } from './dto/oqc.res.dto';
import { PageOqcResDto } from './dto/page-oqc.res.dto';
import {
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
      reqDto.fromDate
        ? gte(qcRequests.inspectionDate, reqDto.fromDate)
        : undefined,
      reqDto.toDate
        ? lt(
            qcRequests.inspectionDate,
            new Date(reqDto.toDate.getTime() + 24 * 60 * 60 * 1000),
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

    const [row] = await this.db
      .select({
        id: qcRequests.id,
        code: qcRequests.code,
        quantity: qcRequests.quantity,
        inspectionDate: qcRequests.inspectionDate,
        inspectionLevel: qcRequests.inspectionLevel,
        aqlLevel: qcRequests.aqlLevel,
        sampleSize: qcRequests.sampleSize,
        defectQty: qcRequests.defectQty,
        resultAuto: qcRequests.resultAuto,
        result: qcRequests.result,
        status: qcRequests.status,
        resultNote: qcRequests.resultNote,
        disposition: qcRequests.disposition,
        dispositionNote: qcRequests.dispositionNote,
        note: qcRequests.note,
        confirmedAt: qcRequests.confirmedAt,
        resolvedAt: qcRequests.resolvedAt,
        createdAt: qcRequests.createdAt,
        updatedAt: qcRequests.updatedAt,
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

    if (!row) {
      throw new AppException(ErrorCode.E174, HttpStatus.NOT_FOUND);
    }

    const [plan, latestAttempt] = await Promise.all([
      row.inspectionLevel && row.aqlLevel
        ? resolveAqlPlan(
            this.db,
            row.quantity,
            row.inspectionLevel,
            row.aqlLevel,
          )
        : undefined,
      this.getLatestAttempt(oqcId),
    ]);

    const attachments = latestAttempt?.attachments ?? [];

    return plainToInstance(
      OqcResDto,
      {
        ...row,
        codeLetter: latestAttempt?.codeLetter ?? null,
        suggestedSampleSize: plan?.sampleSize ?? null,
        ac: latestAttempt?.acceptanceNumber ?? null,
        re: latestAttempt?.rejectionNumber ?? null,
        qcEvidence: attachments.filter(
          (attachment) => attachment.kind === IqcAttachmentKind.QC_EVIDENCE,
        ),
        dispositionEvidence: attachments.filter(
          (attachment) =>
            attachment.kind === IqcAttachmentKind.DISPOSITION_EVIDENCE,
        ),
      },
      { excludeExtraneousValues: true },
    );
  }

  /** Ac/Re/codeLetter đã dùng ở lần kiểm mới nhất — snapshot thật trên `qc_inspections`, không tính
   * lại từ `qc_aql_rules` hiện hành (`docs/decisions/qc-aql-master-data.md`). Khác
   * `suggestedSampleSize` trên `getOqc` — cái đó vẫn tra sống theo `inspectionLevel`/`aqlLevel`
   * hiện tại của request, không phải giá trị lịch sử. */
  private async getLatestAttempt(qcRequestId: string) {
    return this.db.query.qcInspections.findFirst({
      where: eq(qcInspections.qcRequestId, qcRequestId),
      columns: {
        codeLetter: true,
        acceptanceNumber: true,
        rejectionNumber: true,
      },
      with: { attachments: { with: { file: true } } },
      orderBy: desc(qcInspections.attemptNo),
    });
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

  /** `resultAuto` tự suy từ Ac/Re (`resolveAqlResult`) — `result` client gửi thắng nếu có, vắng thì
   * lấy `resultAuto` (cả hai đều vắng → `E200`); QC toàn quyền ghi đè `resultAuto`, không cần lý do.
   * `status` suy theo bảng: PASS → `COMPLETED`; FAIL+null → `PENDING`; FAIL+`REWORK` → `REWORK`
   * (phiếu vẫn mở, QC kiểm lại trên chính phiếu); FAIL+`ACCEPT`/`SCRAP` → `COMPLETED`. Mỗi lần gọi
   * sinh 1 dòng `qc_inspections` mới (attempt) thay vì ghi đè — giữ nguyên lịch sử các vòng REWORK
   * (`docs/decisions/qc-request-attempt-split.md`). Không ghi ngược `production_job_operations` ở
   * bất kỳ nhánh nào — tránh race với thao tác tay của xưởng (`PATCH .../operations/:operationId`),
   * `docs/domains/production.md`. */
  async confirmOqc(
    oqcId: string,
    reqDto: ConfirmOqcReqDto,
    userId: string,
  ): Promise<void> {
    const request = await this.ensureOqcConfirmable(oqcId);

    const plan = await resolveAqlPlan(
      this.db,
      request.quantity,
      reqDto.inspectionLevel,
      reqDto.aqlLevel,
    );
    const resultAuto = plan ? resolveAqlResult(plan, reqDto.defectQty) : null;
    const result = reqDto.result ?? resultAuto;

    if (!result) {
      throw new AppException(ErrorCode.E200, HttpStatus.BAD_REQUEST);
    }

    await this.filesService.linkFiles([
      ...(reqDto.qcEvidenceFileIds ?? []),
      ...(reqDto.dispositionEvidenceFileIds ?? []),
    ]);

    const isPass = result === IqcResult.PASS;
    const status = this.resolveOqcStatus(result, reqDto.disposition);
    const disposition = isPass ? null : (reqDto.disposition ?? null);

    // Phần quyết định QC của lần confirm này — ghi y hệt vào cả dòng attempt mới lẫn mirror trên
    // `qc_requests`, viết một lần để hai bên không lệch nhau.
    const decision = {
      inspectionLevel: reqDto.inspectionLevel,
      aqlLevel: reqDto.aqlLevel,
      sampleSize: reqDto.sampleSize ?? plan?.sampleSize ?? null,
      defectQty: reqDto.defectQty,
      resultAuto,
      result,
      resultNote: reqDto.resultNote ?? null,
      disposition,
      dispositionNote: isPass ? null : (reqDto.dispositionNote ?? null),
    };

    await this.db.transaction(async (tx) => {
      // Khoá request để cấp `attemptNo` tuần tự — không có lock, hai lần confirm song song có thể
      // tính trùng `attemptNo` hoặc cùng nghĩ mình là lần confirm đầu tiên.
      const [locked] = await tx
        .select({
          confirmedAt: qcRequests.confirmedAt,
          resolvedAt: qcRequests.resolvedAt,
          status: qcRequests.status,
          attemptCount: qcRequests.attemptCount,
        })
        .from(qcRequests)
        .where(eq(qcRequests.id, oqcId))
        .for('update');

      if (!locked || locked.status === OqcStatus.COMPLETED) {
        throw new AppException(ErrorCode.E177, HttpStatus.CONFLICT);
      }

      const attemptNo = locked.attemptCount + 1;

      // Bỏ trống (`undefined`) = Drizzle giữ nguyên cột: người/lúc confirm chỉ ghi ở lần confirm
      // đầu tiên, người/lúc chốt phương án chỉ ghi ở lần chốt đầu tiên — nhưng bị xoá hẳn nếu lần
      // confirm này không còn phương án nào.
      const audit: {
        confirmedBy?: string;
        confirmedAt?: Date;
        resolvedBy?: string | null;
        resolvedAt?: Date | null;
      } = {};

      if (locked.confirmedAt === null) {
        audit.confirmedBy = userId;
        audit.confirmedAt = new Date();
      }

      if (!disposition) {
        audit.resolvedBy = null;
        audit.resolvedAt = null;
      } else if (locked.resolvedAt === null) {
        audit.resolvedBy = userId;
        audit.resolvedAt = new Date();
      }

      const [attempt] = await tx
        .insert(qcInspections)
        .values({
          ...decision,
          qcRequestId: oqcId,
          kind: QcKind.OUTGOING,
          quantity: request.quantity,
          attemptNo,
          inspectionDate: request.inspectionDate,
          aqlPlanId: plan?.planId ?? null,
          aqlRuleId: plan?.ruleId ?? null,
          codeLetter: plan?.codeLetter ?? null,
          acceptanceNumber: plan?.ac ?? null,
          rejectionNumber: plan?.re ?? null,
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

      await linkAttachments(
        tx,
        attempt.id,
        IqcAttachmentKind.QC_EVIDENCE,
        reqDto.qcEvidenceFileIds ?? [],
      );
      await linkAttachments(
        tx,
        attempt.id,
        IqcAttachmentKind.DISPOSITION_EVIDENCE,
        isPass ? [] : (reqDto.dispositionEvidenceFileIds ?? []),
      );
    });
  }

  async deleteOqc(oqcId: string): Promise<void> {
    const request = await this.db.query.qcRequests.findFirst({
      columns: { status: true },
      where: and(
        eq(qcRequests.kind, QcKind.OUTGOING),
        eq(qcRequests.id, oqcId),
      ),
    });

    if (!request) {
      throw new AppException(ErrorCode.E174, HttpStatus.NOT_FOUND);
    }
    if (request.status !== OqcStatus.NOT_INSPECTED) {
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
    const request = await this.db.query.qcRequests.findFirst({
      columns: { quantity: true, inspectionDate: true, status: true },
      where: and(
        eq(qcRequests.kind, QcKind.OUTGOING),
        eq(qcRequests.id, oqcId),
      ),
    });

    if (!request) {
      throw new AppException(ErrorCode.E174, HttpStatus.NOT_FOUND);
    }
    if (request.status === OqcStatus.COMPLETED) {
      throw new AppException(ErrorCode.E177, HttpStatus.CONFLICT);
    }

    return request;
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
