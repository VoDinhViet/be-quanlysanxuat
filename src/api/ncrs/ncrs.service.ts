import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { and, count, desc, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

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
  ncrCostLines,
  ncrLogs,
  NcrLogAction,
  NcrOriginType,
  ncrs,
  type NcrSelect,
  NcrStatus,
  NcrType,
  ProductionOrderLogAction,
  productionOrderLogs,
  ProductionOrderNcrAction,
  productionOrders,
  ProductionOrderSourceType,
  ProductionOrderStatus,
  QualityInspectionStatus,
  QualityInspectionType,
  qualityInspections,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { generateOqcCode, getJobFinalOperation } from '../oqc/oqc.query';
import { buildJobPlan } from '../production-jobs/production-job-snapshot.query';
import { ProductionJobsService } from '../production-jobs/production-jobs.service';
import { CreateNcrProductionOrderReqDto } from './dto/create-ncr-production-order.req.dto';
import { CreateNcrReqDto } from './dto/create-ncr.req.dto';
import { GetNcrsReqDto } from './dto/get-ncrs.req.dto';
import { NcrDetailResDto } from './dto/ncr-detail.res.dto';
import { NcrOperationResDto } from './dto/ncr-operation.res.dto';
import { NcrResDto } from './dto/ncr.res.dto';
import { RejectNcrReqDto } from './dto/reject-ncr.req.dto';
import { RequestNcrOqcReqDto } from './dto/request-ncr-oqc.req.dto';
import { SaveNcrCostLinesReqDto } from './dto/save-ncr-cost-lines.req.dto';
import { UpdateNcrReqDto } from './dto/update-ncr.req.dto';
import { generateNcrCode } from './ncrs.write';

const ncrListRelations = {
  item: true,
  client: true,
  order: true,
  productionJob: true,
  department: true,
  approverBy: true,
} as const;

/** SL cần xử lý sau phân tích (sửa chữa + làm mới) — phần còn lại của `ngQty` chỉ ghi nhận. */
function getProcessingQty(ncr: Pick<NcrSelect, 'reworkQty' | 'remakeQty'>) {
  return ncr.reworkQty + ncr.remakeQty;
}

@Injectable()
export class NcrsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly productionJobsService: ProductionJobsService,
  ) {}

  async getNcrs(reqDto: GetNcrsReqDto): Promise<OffsetPaginatedDto<NcrResDto>> {
    const where = and(
      reqDto.q ? unaccentILike(ncrs.code, `%${reqDto.q}%`) : undefined,
      reqDto.status ? eq(ncrs.status, reqDto.status) : undefined,
      reqDto.type ? eq(ncrs.type, reqDto.type) : undefined,
      reqDto.departmentId
        ? eq(ncrs.departmentId, reqDto.departmentId)
        : undefined,
      reqDto.clientId ? eq(ncrs.clientId, reqDto.clientId) : undefined,
    );

    const [pagedNcrs, [{ total }]] = await Promise.all([
      this.db.query.ncrs.findMany({
        where,
        with: ncrListRelations,
        orderBy: desc(ncrs.createdAt),
        limit: reqDto.limit,
        offset: reqDto.offset,
      }),
      this.db.select({ total: count() }).from(ncrs).where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(NcrResDto, pagedNcrs, { excludeExtraneousValues: true }),
      new OffsetPaginationDto(total, reqDto),
    );
  }

  async getNcr(ncrId: string): Promise<NcrDetailResDto> {
    const ncr = await this.db.query.ncrs.findFirst({
      where: eq(ncrs.id, ncrId),
      with: {
        ...ncrListRelations,
        item: { with: { imageFile: true } },
        costLines: { orderBy: ncrCostLines.sortOrder },
        productionOrders: true,
        logs: { with: { performerBy: true }, orderBy: desc(ncrLogs.createdAt) },
      },
    });
    if (!ncr) {
      throw new AppException(ErrorCode.E300, HttpStatus.NOT_FOUND);
    }

    const totalCost = ncr.costLines.reduce((sum, line) => sum + line.amount, 0);

    return plainToInstance(
      NcrDetailResDto,
      { ...ncr, totalCost },
      { excludeExtraneousValues: true },
    );
  }

  /** Công đoạn của sản phẩm (routing + BOM) để chọn công đoạn sửa chữa — suy từ kế hoạch Job giả
   * định, không ghi gì. */
  async getNcrOperations(ncrId: string): Promise<NcrOperationResDto[]> {
    const ncr = await this.ensureNcrExists(ncrId);
    const plan = await buildJobPlan(this.db, {
      id: randomUUID(),
      itemId: ncr.itemId,
      quantity: 1,
    });

    const operationById = new Map(
      plan.operations.map((operation) => [operation.operationId, operation]),
    );

    return plainToInstance(NcrOperationResDto, [...operationById.values()], {
      excludeExtraneousValues: true,
    });
  }

  async createNcr(reqDto: CreateNcrReqDto, userId: string): Promise<void> {
    if (reqDto.type === NcrType.CUSTOMER) {
      if (!reqDto.clientId) {
        throw new AppException(ErrorCode.E304, HttpStatus.BAD_REQUEST);
      }
      if (!reqDto.departmentId) {
        throw new AppException(ErrorCode.E302, HttpStatus.BAD_REQUEST);
      }
    }

    await this.db.transaction(async (tx) => {
      const code = await generateNcrCode(tx, new Date());
      const [ncr] = await tx
        .insert(ncrs)
        .values({
          code,
          type: reqDto.type,
          originType: NcrOriginType.MANUAL,
          itemId: reqDto.itemId,
          clientId: reqDto.clientId,
          orderId: reqDto.orderId,
          productionJobId: reqDto.productionJobId,
          departmentId: reqDto.departmentId,
          ngQty: reqDto.ngQty ?? 0,
          defectDescription: reqDto.defectDescription,
          createdBy: userId,
        })
        .returning({ id: ncrs.id });

      await this.log(tx, ncr.id, NcrLogAction.CREATED, 'Tạo NCR', userId);
    });
  }

  async updateNcr(
    ncrId: string,
    reqDto: UpdateNcrReqDto,
    userId: string,
  ): Promise<void> {
    const ncr = await this.ensureNcrExists(ncrId);
    this.ensureStatus(ncr, [NcrStatus.OPEN, NcrStatus.REJECTED]);

    // `ngQty` của NCR sinh từ OQC là SL NG đã sàng lọc — không sửa tay.
    const ngQty =
      ncr.originType === NcrOriginType.MANUAL
        ? (reqDto.ngQty ?? ncr.ngQty)
        : ncr.ngQty;
    const reworkQty = reqDto.reworkQty ?? ncr.reworkQty;
    const remakeQty = reqDto.remakeQty ?? ncr.remakeQty;
    if (reworkQty + remakeQty > ngQty) {
      throw new AppException(ErrorCode.E303, HttpStatus.BAD_REQUEST);
    }

    await this.db.transaction(async (tx) => {
      await tx
        .update(ncrs)
        .set({
          ngQty,
          reworkQty,
          remakeQty,
          defectDescription: reqDto.defectDescription,
          rootCause: reqDto.rootCause,
          correctiveAction: reqDto.correctiveAction,
          preventiveAction: reqDto.preventiveAction,
          departmentId: reqDto.departmentId,
          reworkOperationIds: reqDto.reworkOperationIds,
        })
        .where(eq(ncrs.id, ncrId));

      await this.log(tx, ncrId, NcrLogAction.UPDATED, 'Cập nhật NCR', userId);
    });
  }

  async submitNcr(ncrId: string, userId: string): Promise<void> {
    const ncr = await this.ensureNcrExists(ncrId);
    this.ensureStatus(ncr, [NcrStatus.OPEN, NcrStatus.REJECTED]);

    if (!ncr.departmentId) {
      throw new AppException(ErrorCode.E302, HttpStatus.BAD_REQUEST);
    }
    if (!ncr.rootCause || !ncr.correctiveAction) {
      throw new AppException(ErrorCode.E309, HttpStatus.BAD_REQUEST);
    }
    if (ncr.reworkQty > 0 && !ncr.reworkOperationIds.length) {
      throw new AppException(ErrorCode.E310, HttpStatus.BAD_REQUEST);
    }

    await this.db.transaction(async (tx) => {
      await tx
        .update(ncrs)
        .set({
          status: NcrStatus.PENDING_APPROVAL,
          submittedBy: userId,
          submittedAt: new Date(),
          rejectionReason: null,
        })
        .where(eq(ncrs.id, ncrId));

      await this.log(
        tx,
        ncrId,
        NcrLogAction.SUBMITTED,
        'Gửi Giám đốc duyệt',
        userId,
      );
    });
  }

  async approveNcr(ncrId: string, userId: string): Promise<void> {
    const ncr = await this.ensureNcrExists(ncrId);
    this.ensureStatus(ncr, [NcrStatus.PENDING_APPROVAL]);

    await this.db.transaction(async (tx) => {
      await tx
        .update(ncrs)
        .set({
          status: NcrStatus.APPROVED,
          approvedBy: userId,
          approvedAt: new Date(),
        })
        .where(eq(ncrs.id, ncrId));

      await this.log(tx, ncrId, NcrLogAction.APPROVED, 'Duyệt NCR', userId);
    });
  }

  async rejectNcr(
    ncrId: string,
    reqDto: RejectNcrReqDto,
    userId: string,
  ): Promise<void> {
    const ncr = await this.ensureNcrExists(ncrId);
    this.ensureStatus(ncr, [NcrStatus.PENDING_APPROVAL]);

    await this.db.transaction(async (tx) => {
      await tx
        .update(ncrs)
        .set({ status: NcrStatus.REJECTED, rejectionReason: reqDto.reason })
        .where(eq(ncrs.id, ncrId));

      await this.log(
        tx,
        ncrId,
        NcrLogAction.REJECTED,
        `Không duyệt: ${reqDto.reason}`,
        userId,
      );
    });
  }

  /** NCR không có SL sửa chữa / làm mới (chỉ ghi nhận) — sau duyệt chỉ còn đóng. */
  async closeNcr(ncrId: string, userId: string): Promise<void> {
    const ncr = await this.ensureNcrExists(ncrId);
    this.ensureStatus(ncr, [NcrStatus.APPROVED]);
    if (getProcessingQty(ncr) > 0) {
      throw new AppException(ErrorCode.E301, HttpStatus.CONFLICT);
    }

    await this.db.transaction(async (tx) => {
      await tx
        .update(ncrs)
        .set({ status: NcrStatus.CLOSED, closedAt: new Date() })
        .where(eq(ncrs.id, ncrId));

      await this.log(tx, ncrId, NcrLogAction.CLOSED, 'Đóng NCR', userId);
    });
  }

  /** "Không tạo LSX": NCR tự xử lý ngoài hệ thống, chuyển sang chờ OQC lại. */
  async completeWithoutProductionOrder(
    ncrId: string,
    userId: string,
  ): Promise<void> {
    await this.ensureProcessableNcr(ncrId, [NcrStatus.APPROVED]);

    await this.db.transaction(async (tx) => {
      await tx
        .update(ncrs)
        .set({ status: NcrStatus.PENDING_QC })
        .where(eq(ncrs.id, ncrId));

      await this.log(
        tx,
        ncrId,
        NcrLogAction.PENDING_QC,
        'Không tạo LSX — chờ OQC lại',
        userId,
      );
    });
  }

  /** LSX phụ: header `source_type = NCR` cùng `orderId` với đơn liên quan, duyệt luôn, 1 Job. Sửa
   * chữa → Job không cấp vật tư, chỉ chạy công đoạn đã chọn; làm mới → Job như LSX thường. */
  async createProductionOrder(
    ncrId: string,
    reqDto: CreateNcrProductionOrderReqDto,
    userId: string,
  ): Promise<void> {
    const ncr = await this.ensureProcessableNcr(ncrId, [
      NcrStatus.APPROVED,
      NcrStatus.IN_PROGRESS,
    ]);
    const orderId = ncr.orderId;
    if (!orderId) {
      throw new AppException(ErrorCode.E305, HttpStatus.BAD_REQUEST);
    }

    const isRework = reqDto.action === ProductionOrderNcrAction.REWORK;
    const quantity = isRework ? ncr.reworkQty : ncr.remakeQty;
    if (quantity <= 0) {
      throw new AppException(ErrorCode.E307, HttpStatus.BAD_REQUEST);
    }

    const existingProductionOrder =
      await this.db.query.productionOrders.findFirst({
        columns: { id: true },
        where: and(
          eq(productionOrders.ncrId, ncrId),
          eq(productionOrders.ncrAction, reqDto.action),
        ),
      });
    if (existingProductionOrder) {
      throw new AppException(ErrorCode.E306, HttpStatus.CONFLICT);
    }

    await this.db.transaction(async (tx) => {
      const sequence = await generateDocumentSequence(
        tx,
        DocumentType.PRODUCTION_ORDER,
      );
      const code = `LSX${String(sequence).padStart(4, '0')}`;
      const [productionOrder] = await tx
        .insert(productionOrders)
        .values({
          code,
          orderId,
          sourceType: ProductionOrderSourceType.NCR,
          ncrId,
          ncrAction: reqDto.action,
          status: ProductionOrderStatus.APPROVED,
          approvedBy: userId,
          approvedAt: new Date(),
          createdBy: userId,
        })
        .returning({ id: productionOrders.id });

      await this.productionJobsService.createJobs(
        tx,
        { id: productionOrder.id, code },
        new Map([[ncr.itemId, quantity]]),
        userId,
        isRework ? { operationIds: ncr.reworkOperationIds } : undefined,
      );

      await tx.insert(productionOrderLogs).values({
        productionOrderId: productionOrder.id,
        action: ProductionOrderLogAction.CREATED,
        content: `Tạo LSX phụ từ ${ncr.code}`,
        performedBy: userId,
      });
      await tx
        .update(ncrs)
        .set({ status: NcrStatus.IN_PROGRESS })
        .where(eq(ncrs.id, ncrId));
      await this.log(
        tx,
        ncrId,
        NcrLogAction.PRODUCTION_ORDER_CREATED,
        `Tạo LSX ${code} (${isRework ? 'sửa chữa' : 'làm mới'}, SL ${quantity})`,
        userId,
      );
    });
  }

  /** "Yêu cầu OQC lại" cho hàng đã xử lý ngoài LSX: tạo phiếu OQC `DRAFT` gắn Job gốc + NCR. Không
   * qua gate quota `E198`/`E176` của `OqcService.createOqcForJob` — lô sàng lọc ban đầu đã chiếm hết
   * quota, trần ở đây là SL xử lý của NCR. */
  async requestOqc(
    ncrId: string,
    reqDto: RequestNcrOqcReqDto,
    userId: string,
  ): Promise<void> {
    const ncr = await this.ensureProcessableNcr(ncrId, [
      NcrStatus.APPROVED,
      NcrStatus.PENDING_QC,
    ]);
    if (!ncr.productionJobId) {
      throw new AppException(ErrorCode.E311, HttpStatus.BAD_REQUEST);
    }

    const processingQty = getProcessingQty(ncr);
    const quantity = reqDto.quantity ?? processingQty;
    if (quantity > processingQty) {
      throw new AppException(ErrorCode.E308, HttpStatus.BAD_REQUEST);
    }

    const finalOperation = await getJobFinalOperation(
      this.db,
      ncr.productionJobId,
    );
    if (!finalOperation?.operationId) {
      throw new AppException(ErrorCode.E213, HttpStatus.BAD_REQUEST);
    }
    const operationId = finalOperation.operationId;

    await this.db.transaction(async (tx) => {
      const requestedAt = new Date();
      await tx.insert(qualityInspections).values({
        quantity,
        requestedAt,
        inspectionNo: await generateOqcCode(tx, requestedAt),
        inspectionType: QualityInspectionType.OQC,
        productionJobId: ncr.productionJobId,
        productionJobOperationId: operationId,
        itemId: ncr.itemId,
        ncrId,
        status: QualityInspectionStatus.DRAFT,
        createdBy: userId,
      });
      await tx
        .update(ncrs)
        .set({ status: NcrStatus.PENDING_QC })
        .where(eq(ncrs.id, ncrId));
      await this.log(
        tx,
        ncrId,
        NcrLogAction.OQC_REQUESTED,
        `Yêu cầu OQC lại (SL ${quantity})`,
        userId,
      );
    });
  }

  /** Thay toàn bộ dòng dự toán — nhập tay, `amount = quantity × unitPrice`. */
  async saveCostLines(
    ncrId: string,
    reqDto: SaveNcrCostLinesReqDto,
  ): Promise<void> {
    await this.ensureNcrExists(ncrId);

    await this.db.transaction(async (tx) => {
      await tx.delete(ncrCostLines).where(eq(ncrCostLines.ncrId, ncrId));

      if (!reqDto.lines.length) {
        return;
      }
      await tx.insert(ncrCostLines).values(
        reqDto.lines.map((line, index) => ({
          ncrId,
          kind: line.kind,
          description: line.description,
          itemId: line.itemId,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          amount: Math.round(line.quantity * line.unitPrice * 100) / 100,
          sortOrder: index,
        })),
      );
    });
  }

  /** Chỉ xử lý được khi NCR đúng trạng thái và có SL sửa chữa / làm mới. */
  private async ensureProcessableNcr(
    ncrId: string,
    statuses: NcrStatus[],
  ): Promise<NcrSelect> {
    const ncr = await this.ensureNcrExists(ncrId);
    this.ensureStatus(ncr, statuses);
    if (getProcessingQty(ncr) <= 0) {
      throw new AppException(ErrorCode.E307, HttpStatus.BAD_REQUEST);
    }

    return ncr;
  }

  private async ensureNcrExists(ncrId: string): Promise<NcrSelect> {
    const ncr = await this.db.query.ncrs.findFirst({
      where: eq(ncrs.id, ncrId),
    });
    if (!ncr) {
      throw new AppException(ErrorCode.E300, HttpStatus.NOT_FOUND);
    }

    return ncr;
  }

  private ensureStatus(ncr: NcrSelect, statuses: NcrStatus[]): void {
    if (!statuses.includes(ncr.status)) {
      throw new AppException(ErrorCode.E301, HttpStatus.CONFLICT);
    }
  }

  private async log(
    tx: DbTransaction,
    ncrId: string,
    action: NcrLogAction,
    content: string,
    userId: string,
  ): Promise<void> {
    await tx
      .insert(ncrLogs)
      .values({ ncrId, action, content, performedBy: userId });
  }
}
