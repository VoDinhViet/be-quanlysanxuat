import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import {
  and,
  count,
  desc,
  eq,
  getTableColumns,
  isNull,
  sql,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

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
import { vnToday } from '../../database/vn-date.util';
import {
  clients,
  departments,
  inventoryReceipts,
  IqcDisposition,
  IqcResult,
  IqcStatus,
  items,
  outsourcingReceiptItems,
  outsourcingReceipts,
  productionJobOperations,
  productionJobs,
  purchaseOrders,
  QualityEvidenceKind,
  QualityInspectionDecision,
  QualityInspectionOriginType,
  QualityInspectionStatus,
  QualityInspectionType,
  qualityInspectionResults,
  qualityInspections,
  type QualityInspectionSelect,
  suppliers,
  supplierReturns,
  units,
  users,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { FilesService } from '../files/files.service';
import { closeJobIfQcCovered } from '../oqc/oqc.query';
import { SupplierReturnsService } from '../supplier-returns/supplier-returns.service';
import { AqlPlanResDto } from './dto/aql-plan.res.dto';
import { ConfirmIqcReqDto } from './dto/confirm-iqc.req.dto';
import { CreateIqcReqDto } from './dto/create-iqc.req.dto';
import { GetAqlPlanReqDto } from './dto/get-aql-plan.req.dto';
import { GetIqcsReqDto } from './dto/get-iqcs.req.dto';
import { IqcResDto } from './dto/iqc.res.dto';
import { IqcStatsResDto } from './dto/iqc-stats.res.dto';
import { PageIqcResDto } from './dto/page-iqc.res.dto';
import { UpdateIqcReqDto } from './dto/update-iqc.req.dto';
import { resolveAqlPlan } from './iqc-aql.query';
import { linkQcFiles } from './iqc.write';
import { toInspectionStatus } from './quality-inspection-status.util';

// `supplierId` có thể null từ BUG-065 (dòng IQC sinh từ phiếu RETURN gắn khách hàng dùng `clientId`
// thay thế, loại trừ lẫn nhau — `chk_quality_inspections_supplier_client_exclusive`). `confirmIqc`
// tự chặn (`E254`) disposition SORT/RETURN khi không có `supplierId`, nên `supplierReturnsService
// .createFromIqcDisposition` chỉ bao giờ được gọi với `supplierId` đã biết chắc khác null.
type IqcSavableInspection = Pick<
  QualityInspectionSelect,
  | 'quantity'
  | 'status'
  | 'requestedAt'
  | 'originType'
  | 'originId'
  | 'purchaseOrderId'
  | 'supplierId'
  | 'itemId'
  | 'productionJobId'
>;

const creatorUsers = alias(users, 'iqc_creator');
const confirmerUsers = alias(users, 'iqc_confirmer');
const resolverUsers = alias(users, 'iqc_resolver');

@Injectable()
export class IqcService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly filesService: FilesService,
    private readonly supplierReturnsService: SupplierReturnsService,
  ) {}

  async getIqcs(
    reqDto: GetIqcsReqDto,
  ): Promise<OffsetPaginatedDto<PageIqcResDto>> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;

    const where = and(
      eq(qualityInspections.inspectionType, QualityInspectionType.IQC),
      keyword
        ? unaccentILike(qualityInspections.inspectionNo, keyword)
        : undefined,
      reqDto.supplierId
        ? eq(qualityInspections.supplierId, reqDto.supplierId)
        : undefined,
      reqDto.clientId
        ? eq(qualityInspections.clientId, reqDto.clientId)
        : undefined,
      reqDto.result
        ? eq(
            qualityInspections.decision,
            reqDto.result as string as QualityInspectionDecision,
          )
        : undefined,
      reqDto.disposition
        ? eq(qualityInspections.disposition, reqDto.disposition)
        : undefined,
      reqDto.status ? eq(qualityInspections.status, reqDto.status) : undefined,
    );

    const [rows, countRows] = await Promise.all([
      this.db
        .select({
          id: qualityInspections.id,
          code: qualityInspections.inspectionNo,
          inventoryReceipt: getTableColumns(inventoryReceipts),
          purchaseOrder: getTableColumns(purchaseOrders),
          productionJob: getTableColumns(productionJobs),
          productionJobOperation: getTableColumns(productionJobOperations),
          supplier: getTableColumns(suppliers),
          client: getTableColumns(clients),
          item: getTableColumns(items),
          unit: getTableColumns(units),
          quantity: qualityInspections.quantity,
          inspectionDate: qualityInspections.requestedAt,
          result: qualityInspections.decision,
          disposition: qualityInspections.disposition,
          status: qualityInspections.status,
          reason: qualityInspections.reason,
          note: qualityInspections.note,
          creatorBy: getTableColumns(creatorUsers),
          createdAt: qualityInspections.createdAt,
          updatedAt: qualityInspections.updatedAt,
        })
        .from(qualityInspections)
        .innerJoin(items, eq(items.id, qualityInspections.itemId))
        .innerJoin(units, eq(units.id, items.unitId))
        .leftJoin(suppliers, eq(suppliers.id, qualityInspections.supplierId))
        .leftJoin(clients, eq(clients.id, qualityInspections.clientId))
        .leftJoin(
          inventoryReceipts,
          and(
            eq(
              qualityInspections.originType,
              QualityInspectionOriginType.INVENTORY_RECEIPT,
            ),
            eq(qualityInspections.originId, inventoryReceipts.id),
          ),
        )
        .leftJoin(
          purchaseOrders,
          eq(purchaseOrders.id, qualityInspections.purchaseOrderId),
        )
        .leftJoin(
          productionJobs,
          eq(productionJobs.id, qualityInspections.productionJobId),
        )
        .leftJoin(
          productionJobOperations,
          eq(
            productionJobOperations.id,
            qualityInspections.productionJobOperationId,
          ),
        )
        .leftJoin(
          creatorUsers,
          eq(creatorUsers.id, qualityInspections.createdBy),
        )
        .where(where)
        .orderBy(desc(qualityInspections.createdAt))
        .limit(reqDto.limit)
        .offset(reqDto.offset),
      this.db.select({ total: count() }).from(qualityInspections).where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(
        PageIqcResDto,
        rows.map(({ unit, ...row }) => ({
          ...row,
          item: { ...row.item, unit },
        })),
        { excludeExtraneousValues: true },
      ),
      new OffsetPaginationDto(countRows[0]?.total ?? 0, reqDto),
    );
  }

  async getIqcStats(): Promise<IqcStatsResDto> {
    const [row] = await this.db
      .select({
        total: count(),
        notInspected: count(
          sql`case when ${qualityInspections.status} = ${QualityInspectionStatus.DRAFT} then 1 end`,
        ),
        pass: count(
          sql`case when ${qualityInspections.decision} = ${IqcResult.PASS} then 1 end`,
        ),
        fail: count(
          sql`case when ${qualityInspections.decision} = ${IqcResult.FAIL} then 1 end`,
        ),
        pending: count(
          sql`case when ${qualityInspections.status} = ${QualityInspectionStatus.PENDING} then 1 end`,
        ),
        waitingReturn: count(
          sql`case when ${qualityInspections.status} = ${QualityInspectionStatus.IN_PROGRESS} then 1 end`,
        ),
        completed: count(
          sql`case when ${qualityInspections.status} = ${QualityInspectionStatus.COMPLETED} then 1 end`,
        ),
      })
      .from(qualityInspections)
      .where(eq(qualityInspections.inspectionType, QualityInspectionType.IQC));

    return plainToInstance(IqcStatsResDto, row, {
      excludeExtraneousValues: true,
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
      throw new AppException(ErrorCode.E219, HttpStatus.NOT_FOUND);
    }

    return plainToInstance(AqlPlanResDto, plan, {
      excludeExtraneousValues: true,
    });
  }

  /** `POST /iqc` cho phép gửi thẳng `result` (khác `POST /oqc`, luôn tách 2 bước) — có `result` thì
   * tạo cả case row lẫn attempt #1 cùng lúc, thiếu `result` thì chỉ tạo case row `NOT_INSPECTED`
   * (chưa có lần kiểm nào). Không có khối AQL/bằng chứng ở route này — attempt #1 sinh ra đây chỉ
   * mang đúng `result`/`disposition`/`reason`/`note`, các cột AQL để `NULL`. */
  async createIqc(reqDto: CreateIqcReqDto, userId: string): Promise<void> {
    await this.ensureSupplierExists(reqDto.supplierId);
    await this.ensureItemExists(reqDto.itemId);
    if (reqDto.inventoryReceiptId) {
      await this.ensureInventoryReceiptExists(reqDto.inventoryReceiptId);
    }
    if (reqDto.purchaseOrderId) {
      await this.ensurePurchaseOrderExists(reqDto.purchaseOrderId);
    }

    if (reqDto.disposition && reqDto.result !== IqcResult.FAIL) {
      throw new AppException(ErrorCode.E139, HttpStatus.BAD_REQUEST);
    }

    const status = this.resolveIqcStatus(reqDto.result, reqDto.disposition);
    const {
      inventoryReceiptId,
      purchaseOrderId,
      supplierId,
      itemId,
      quantity,
      inspectionDate,
      result,
      disposition,
      reason,
      note,
    } = reqDto;
    // `IqcResult` (PASS/FAIL) là API vocabulary cũ, `decision` cột mới union rộng hơn
    // (`quality_inspection_decision`) — 2 vocabulary cùng giá trị string, ép kiểu tại điểm ghi
    // duy nhất thay vì đổi cột schema hẹp lại theo route này (xem `quality-inspections.ts`).
    const decision = result as QualityInspectionDecision | undefined;

    await this.db.transaction(async (tx) => {
      const code = await this.generateIqcCode(tx, inspectionDate);

      const [inspection] = await tx
        .insert(qualityInspections)
        .values({
          inspectionNo: code,
          inspectionType: QualityInspectionType.IQC,
          originType: inventoryReceiptId
            ? QualityInspectionOriginType.INVENTORY_RECEIPT
            : QualityInspectionOriginType.MANUAL,
          originId: inventoryReceiptId ?? null,
          purchaseOrderId,
          supplierId,
          itemId,
          quantity,
          requestedAt: inspectionDate,
          decision,
          disposition: result ? disposition : undefined,
          status: toInspectionStatus(status),
          reason,
          note,
          attemptCount: result ? 1 : 0,
          createdBy: userId,
        })
        .returning({ id: qualityInspections.id });

      if (result) {
        await tx.insert(qualityInspectionResults).values({
          qualityInspectionId: inspection.id,
          inspectionType: QualityInspectionType.IQC,
          quantity,
          attemptNo: 1,
          inspectedAt: inspectionDate,
          decision: decision!,
          disposition,
          resultingStatus: toInspectionStatus(status),
          inspectedBy: userId,
        });
      }
    });
  }

  /** Sinh phiếu IQC cho từng dòng phiếu nhập khi phiếu được xác nhận có yêu cầu QC — đường ghi tự
   *  động duy nhất vào `quality_inspections` (`inspectionType = IQC`), luôn `DRAFT` nên không sinh
   *  attempt nào. Gọi trong transaction của `InventoryReceiptsService.confirmInventoryReceipt`; xem
   *  `docs/workflows/receipt-confirmation.md`. */
  async createInspectionsFromReceipt(
    tx: DbTransaction,
    params: {
      inventoryReceiptId: string;
      purchaseOrderId: string | null;
      supplierId: string | null;
      clientId: string | null;
      inspectionDate: Date;
      lines: { itemId: string; quantity: number }[];
      userId: string;
    },
  ): Promise<void> {
    if (!params.lines.length) {
      return;
    }

    const codes = await this.generateIqcCodes(
      tx,
      params.inspectionDate,
      params.lines.length,
    );

    await tx.insert(qualityInspections).values(
      params.lines.map((line, index) => ({
        inspectionNo: codes[index],
        inspectionType: QualityInspectionType.IQC,
        originType: QualityInspectionOriginType.INVENTORY_RECEIPT,
        originId: params.inventoryReceiptId,
        purchaseOrderId: params.purchaseOrderId,
        supplierId: params.supplierId,
        clientId: params.clientId,
        itemId: line.itemId,
        quantity: line.quantity,
        requestedAt: params.inspectionDate,
        status: QualityInspectionStatus.DRAFT,
        createdBy: params.userId,
      })),
    );
  }

  /** Sinh 1 phiếu IQC cho MỖI dòng phiếu nhận gia công ngoài có `requiresIqc = true` — đường tạo
   *  tự động thứ ba (song sinh `createInspectionsFromReceipt`), gọi trong transaction của
   *  `OutsourcingReceiptsService.createOutsourcingReceipt`. **Không** gate `create` — hàng đã về nhà
   *  máy vật lý trước khi các dòng IQC này được kiểm (không phải ghi tồn — gia công ngoài không đụng
   *  `inventory_balances`, `docs/decisions/wip-not-stocked.md`). Mỗi dòng neo thẳng vào công đoạn
   *  `OUTSOURCE` sinh ra nó (`productionJobOperationId`/`productionJobId`, denormalize từ dòng
   *  OS-OUT nguồn qua `outsourcingOrderItemId`) — đây là neo mà `getJobQcCoverage` dùng để gộp
   *  chung với OQC, thay vì suy mờ qua `(outsourcingReceiptId, itemId)` như trước (một OS-IN gộp
   *  được nhiều Job khác nhau cùng NCC, suy theo cặp đó có thể lẫn Job). Xem
   *  `docs/workflows/outsourcing-round-trip.md`. */
  async createInspectionsFromOutsourcingReceipt(
    tx: DbTransaction,
    params: {
      outsourcingReceiptId: string;
      supplierId: string;
      inspectionDate: Date;
      lines: {
        outsourcingReceiptItemId: string;
        itemId: string;
        quantity: number;
        productionJobId: string | null;
        productionJobOperationId: string | null;
      }[];
      userId: string;
    },
  ): Promise<void> {
    if (!params.lines.length) {
      return;
    }

    const codes = await this.generateIqcCodes(
      tx,
      params.inspectionDate,
      params.lines.length,
    );

    await tx.insert(qualityInspections).values(
      params.lines.map((line, index) => ({
        inspectionNo: codes[index],
        inspectionType: QualityInspectionType.IQC,
        originType: QualityInspectionOriginType.OUTSOURCING_RECEIPT_ITEM,
        originId: line.outsourcingReceiptItemId,
        productionJobId: line.productionJobId,
        productionJobOperationId: line.productionJobOperationId,
        supplierId: params.supplierId,
        itemId: line.itemId,
        quantity: line.quantity,
        requestedAt: params.inspectionDate,
        status: QualityInspectionStatus.DRAFT,
        createdBy: params.userId,
      })),
    );
  }

  /** `true` chỉ khi phiếu nhập có ≥ 1 phiếu IQC và **mọi** phiếu đã `COMPLETED` — dùng bởi
   *  `InventoryReceiptsService.postInventoryReceipt` để chặn `E153`. */
  async areInspectionsCompletedForReceipt(
    tx: DbTransaction,
    inventoryReceiptId: string,
  ): Promise<boolean> {
    const inspections = await tx.query.qualityInspections.findMany({
      columns: { status: true },
      where: and(
        eq(qualityInspections.inspectionType, QualityInspectionType.IQC),
        eq(
          qualityInspections.originType,
          QualityInspectionOriginType.INVENTORY_RECEIPT,
        ),
        eq(qualityInspections.originId, inventoryReceiptId),
      ),
    });

    return (
      inspections.length > 0 &&
      inspections.every(
        (inspection) => inspection.status === QualityInspectionStatus.COMPLETED,
      )
    );
  }

  async getIqc(iqcId: string): Promise<IqcResDto> {
    const [row] = await this.db
      .select({
        id: qualityInspections.id,
        code: qualityInspections.inspectionNo,
        inventoryReceipt: getTableColumns(inventoryReceipts),
        outsourcingReceipt: getTableColumns(outsourcingReceipts),
        productionJob: getTableColumns(productionJobs),
        productionJobOperation: getTableColumns(productionJobOperations),
        purchaseOrder: getTableColumns(purchaseOrders),
        supplier: getTableColumns(suppliers),
        client: getTableColumns(clients),
        item: getTableColumns(items),
        unit: getTableColumns(units),
        quantity: qualityInspections.quantity,
        inspectionDate: qualityInspections.requestedAt,
        result: qualityInspections.decision,
        disposition: qualityInspections.disposition,
        status: qualityInspections.status,
        reason: qualityInspections.reason,
        note: qualityInspections.note,
        resultNote: qualityInspections.decisionNote,
        dispositionNote: qualityInspections.dispositionNote,
        sortOkQty: qualityInspections.sortOkQty,
        sortNgQty: qualityInspections.sortNgQty,
        qcDepartment: getTableColumns(departments),
        inspectionLevel: qualityInspections.inspectionLevel,
        aqlLevel: qualityInspections.aqlLevel,
        sampleSize: qualityInspections.sampleSize,
        defectQty: qualityInspections.defectQty,
        inspectionStandard: qualityInspections.inspectionStandard,
        inspectorName: qualityInspections.inspectorName,
        measuringTools: qualityInspections.measuringTools,
        confirmerBy: getTableColumns(confirmerUsers),
        confirmedAt: qualityInspections.startedAt,
        resolverBy: getTableColumns(resolverUsers),
        resolvedAt: qualityInspections.approvedAt,
        creatorBy: getTableColumns(creatorUsers),
        createdAt: qualityInspections.createdAt,
        updatedAt: qualityInspections.updatedAt,
      })
      .from(qualityInspections)
      .innerJoin(items, eq(items.id, qualityInspections.itemId))
      .innerJoin(units, eq(units.id, items.unitId))
      .leftJoin(suppliers, eq(suppliers.id, qualityInspections.supplierId))
      .leftJoin(clients, eq(clients.id, qualityInspections.clientId))
      .leftJoin(
        inventoryReceipts,
        and(
          eq(
            qualityInspections.originType,
            QualityInspectionOriginType.INVENTORY_RECEIPT,
          ),
          eq(qualityInspections.originId, inventoryReceipts.id),
        ),
      )
      .leftJoin(
        outsourcingReceiptItems,
        and(
          eq(
            qualityInspections.originType,
            QualityInspectionOriginType.OUTSOURCING_RECEIPT_ITEM,
          ),
          eq(qualityInspections.originId, outsourcingReceiptItems.id),
        ),
      )
      .leftJoin(
        outsourcingReceipts,
        eq(
          outsourcingReceipts.id,
          outsourcingReceiptItems.outsourcingReceiptId,
        ),
      )
      .leftJoin(
        purchaseOrders,
        eq(purchaseOrders.id, qualityInspections.purchaseOrderId),
      )
      .leftJoin(
        productionJobs,
        eq(productionJobs.id, qualityInspections.productionJobId),
      )
      .leftJoin(
        productionJobOperations,
        eq(
          productionJobOperations.id,
          qualityInspections.productionJobOperationId,
        ),
      )
      .leftJoin(
        departments,
        eq(departments.id, qualityInspections.qcDepartmentId),
      )
      .leftJoin(
        confirmerUsers,
        eq(confirmerUsers.id, qualityInspections.inspectedBy),
      )
      .leftJoin(
        resolverUsers,
        eq(resolverUsers.id, qualityInspections.approvedBy),
      )
      .leftJoin(creatorUsers, eq(creatorUsers.id, qualityInspections.createdBy))
      .where(
        and(
          eq(qualityInspections.inspectionType, QualityInspectionType.IQC),
          eq(qualityInspections.id, iqcId),
        ),
      )
      .limit(1);

    if (!row) {
      throw new AppException(ErrorCode.E138, HttpStatus.NOT_FOUND);
    }

    const [latestAttempt, supplierReturn] = await Promise.all([
      this.getLatestAttempt(iqcId),
      this.db.query.supplierReturns.findFirst({
        where: eq(supplierReturns.qualityInspectionId, iqcId),
        columns: { id: true, code: true, status: true },
        orderBy: desc(supplierReturns.createdAt),
      }),
    ]);

    const evidences = latestAttempt?.evidences ?? [];
    const { unit, ...inspection } = row;

    return plainToInstance(
      IqcResDto,
      {
        ...inspection,
        item: { ...inspection.item, unit },
        ac: latestAttempt?.acceptanceNumber ?? null,
        re: latestAttempt?.rejectionNumber ?? null,
        qcEvidence: evidences.filter(
          (evidence) => evidence.kind === QualityEvidenceKind.QC_EVIDENCE,
        ),
        dispositionEvidence: evidences.filter(
          (evidence) =>
            evidence.kind === QualityEvidenceKind.DISPOSITION_EVIDENCE,
        ),
        supplierReturn: supplierReturn ?? null,
      },
      { excludeExtraneousValues: true },
    );
  }

  /** Lần kiểm mới nhất của một case row, kèm bằng chứng — chỉ phục vụ `getIqc`: `ac`/`re` hiển thị
   * là snapshot đã dùng lúc kiểm, không tính lại từ `qc_aql_rules` hiện hành
   * (`docs/decisions/qc-aql-master-data.md`). */
  private async getLatestAttempt(qualityInspectionId: string) {
    return this.db.query.qualityInspectionResults.findFirst({
      where: eq(
        qualityInspectionResults.qualityInspectionId,
        qualityInspectionId,
      ),
      orderBy: desc(qualityInspectionResults.attemptNo),
      with: { evidences: { with: { file: true } } },
    });
  }

  /** Xem `docs/domains/quality-iqc.md` — quy tắc suy `status`, dùng chung cho tạo lẫn lưu kết quả QC. */
  private resolveIqcStatus(
    result: IqcResult | undefined,
    disposition: IqcDisposition | undefined,
  ): IqcStatus {
    if (!result) {
      return IqcStatus.NOT_INSPECTED;
    }
    if (result === IqcResult.PASS) {
      return IqcStatus.COMPLETED;
    }
    if (!disposition) {
      return IqcStatus.PENDING;
    }
    return disposition === IqcDisposition.CONCESSION
      ? IqcStatus.COMPLETED
      : IqcStatus.WAITING_RETURN;
  }

  /** Nút "Lưu" duy nhất của trang chi tiết IQC — gộp cả phần xác nhận AQL lẫn phần chọn phương án
   * xử lý FAIL (route `POST /iqc/:iqcId/resolve` cũ đã xoá). Gọi lại được nhiều lần trừ khi request
   * đã ở trạng thái tương đương `WAITING_RETURN` cũ (`E159`) — mỗi lần gọi sinh **1 dòng
   * `quality_inspection_results` mới** (attempt), không còn `UPDATE` đè lên chính nó như trước khi
   * tách case row/attempt (`docs/decisions/qc-data-model.md`); `quality_inspections` chỉ giữ
   * mirror của attempt mới nhất — nguồn duy nhất mọi gate/list/detail khác đang đọc. */
  async confirmIqc(
    iqcId: string,
    reqDto: ConfirmIqcReqDto,
    userId: string,
  ): Promise<void> {
    const inspection = await this.ensureIqcSavable(iqcId);

    this.validateDecision(reqDto, inspection.quantity);

    if (reqDto.qcDepartmentId) {
      await this.ensureDepartmentExists(reqDto.qcDepartmentId);
    }

    await this.filesService.linkFiles([
      ...(reqDto.qcEvidenceFileIds ?? []),
      ...(reqDto.dispositionEvidenceFileIds ?? []),
    ]);

    const status = this.resolveIqcStatus(reqDto.result, reqDto.disposition);

    // Disposition SORT/RETURN tự sinh phiếu trả NCC (`supplierReturnsService
    // .createFromIqcDisposition`, đòi `supplierId` khác null) — dòng sinh từ phiếu RETURN gắn
    // khách hàng không có NCC nào để trả, chưa có phương án trả-lại-khách (BUG-065).
    if (status === IqcStatus.WAITING_RETURN && !inspection.supplierId) {
      throw new AppException(ErrorCode.E254, HttpStatus.BAD_REQUEST);
    }

    const isPass = reqDto.result === IqcResult.PASS;
    const inspectionDate = reqDto.inspectionDate ?? inspection.requestedAt;
    const disposition = isPass ? null : (reqDto.disposition ?? null);
    const dispositionNote = isPass ? null : (reqDto.dispositionNote ?? null);
    const isSort = disposition === IqcDisposition.SORT;
    const sortOkQty = isSort ? (reqDto.sortOkQty ?? null) : null;
    const sortNgQty = isSort ? (reqDto.sortNgQty ?? null) : null;

    // Phần quyết định QC của lần confirm này — ghi y hệt vào cả dòng attempt mới lẫn mirror trên
    // `quality_inspections`, viết một lần để hai bên không lệch nhau.
    const decision = {
      inspectionLevel: reqDto.inspectionLevel,
      aqlLevel: reqDto.aqlLevel,
      sampleSize: reqDto.sampleSize,
      defectQty: reqDto.defectQty,
      decision: reqDto.result as string as QualityInspectionDecision,
      decisionNote: reqDto.resultNote ?? null,
      disposition,
      dispositionNote,
      sortOkQty,
      sortNgQty,
      inspectionStandard: reqDto.inspectionStandard ?? null,
      inspectorName: reqDto.inspectorName ?? null,
      measuringTools: reqDto.measuringTools ?? null,
      qcDepartmentId: reqDto.qcDepartmentId ?? null,
    };

    // Suy kho trả hàng NGOÀI transaction — thuần đọc, và phải fail sớm (E163) trước khi ghi bất
    // cứ gì nếu không suy được, thay vì rollback nửa chừng.
    const returnTarget =
      status === IqcStatus.WAITING_RETURN
        ? {
            warehouseId: await this.resolveReturnWarehouseId(inspection),
            quantity: this.resolveReturnQuantity(inspection, reqDto),
          }
        : null;

    const plan = await resolveAqlPlan(
      this.db,
      inspection.quantity,
      reqDto.inspectionLevel,
      reqDto.aqlLevel,
    );

    await this.db.transaction(async (tx) => {
      // Khoá case row để cấp `attemptNo` tuần tự và đọc đúng `startedAt`/`approvedAt` hiện hành —
      // không có lock, hai lần confirm song song có thể tính trùng `attemptNo`
      // (`uq_quality_inspection_results_inspection_attempt` biến đua thành lỗi constraint thay vì
      // ghi trùng, nhưng lock tránh luôn ca đó) hoặc cùng nghĩ mình là "lần confirm đầu tiên".
      const [locked] = await tx
        .select({
          startedAt: qualityInspections.startedAt,
          approvedAt: qualityInspections.approvedAt,
          status: qualityInspections.status,
          attemptCount: qualityInspections.attemptCount,
        })
        .from(qualityInspections)
        .where(eq(qualityInspections.id, iqcId))
        .for('update');

      if (!locked || locked.status === QualityInspectionStatus.IN_PROGRESS) {
        throw new AppException(ErrorCode.E159, HttpStatus.CONFLICT);
      }

      const attemptNo = locked.attemptCount + 1;

      // Bỏ trống (`undefined`) = Drizzle giữ nguyên cột: người/lúc confirm chỉ ghi ở lần confirm
      // đầu tiên, người/lúc chốt phương án chỉ ghi ở lần chốt đầu tiên — nhưng bị xoá hẳn nếu lần
      // confirm này không còn phương án nào.
      const audit: {
        inspectedBy?: string;
        startedAt?: Date;
        approvedBy?: string | null;
        approvedAt?: Date | null;
      } = {};

      if (locked.startedAt === null) {
        audit.inspectedBy = userId;
        audit.startedAt = new Date();
      }

      if (!disposition) {
        audit.approvedBy = null;
        audit.approvedAt = null;
      } else if (locked.approvedAt === null) {
        audit.approvedBy = userId;
        audit.approvedAt = new Date();
      }

      const dbStatus = toInspectionStatus(status);

      const [attempt] = await tx
        .insert(qualityInspectionResults)
        .values({
          ...decision,
          qualityInspectionId: iqcId,
          inspectionType: QualityInspectionType.IQC,
          quantity: inspection.quantity,
          attemptNo,
          inspectedAt: inspectionDate,
          aqlPlanId: plan?.planId ?? null,
          aqlRuleId: plan?.ruleId ?? null,
          codeLetter: plan?.codeLetter ?? null,
          acceptanceNumber: plan?.ac ?? null,
          rejectionNumber: plan?.re ?? null,
          resultingStatus: dbStatus,
          inspectedBy: userId,
        })
        .returning({ id: qualityInspectionResults.id });

      await tx
        .update(qualityInspections)
        .set({
          ...decision,
          requestedAt: inspectionDate,
          status: dbStatus,
          attemptCount: attemptNo,
          ...audit,
        })
        .where(eq(qualityInspections.id, iqcId));

      // Công đoạn `OUTSOURCE` neo IQC vào `productionJobId` (`getJobQcCoverage` gộp chung IQC/OQC,
      // `docs/decisions/qc-data-model.md`) — dòng IQC này có thể là dòng QC cuối cùng đóng Job,
      // không chỉ OQC mới làm được việc đó. Xem `docs/decisions/production-lifecycle-closing.md`.
      if (status === IqcStatus.COMPLETED && inspection.productionJobId) {
        await closeJobIfQcCovered(tx, inspection.productionJobId);
      }

      await linkQcFiles(
        tx,
        attempt.id,
        QualityEvidenceKind.QC_EVIDENCE,
        reqDto.qcEvidenceFileIds ?? [],
      );
      await linkQcFiles(
        tx,
        attempt.id,
        QualityEvidenceKind.DISPOSITION_EVIDENCE,
        isPass ? [] : (reqDto.dispositionEvidenceFileIds ?? []),
      );

      // Đây là nơi DUY NHẤT một request IQC chuyển sang WAITING_RETURN (IN_PROGRESS ở DB) — khoá
      // lại mọi lần confirm sau đó (E159), nên không cần guard chống tạo phiếu trả trùng.
      // `returnTarget` khác null chỉ khi `status = WAITING_RETURN`, guard E254 ở trên đã đảm bảo
      // `supplierId` khác null lúc đó.
      if (returnTarget) {
        const inventoryReceiptId =
          inspection.originType ===
          QualityInspectionOriginType.INVENTORY_RECEIPT
            ? inspection.originId
            : null;
        // `supplier_returns.outsourcingReceiptId` là FK riêng của bảng đó (không thuộc origin
        // polymorphic của QC) — dòng IQC sinh từ OS-IN chỉ giữ `outsourcingReceiptItemId` qua
        // `originId`, phải suy ngược `outsourcingReceiptId` qua join để CHECK
        // `chk_supplier_returns_warehouse_required` (warehouseId NULL ⟺ outsourcingReceiptId khác
        // NULL) khớp với `resolveReturnWarehouseId` đã trả `null` ở trên cho đúng ca này.
        const outsourcingReceiptId =
          inspection.originType ===
          QualityInspectionOriginType.OUTSOURCING_RECEIPT_ITEM
            ? ((
                await tx.query.outsourcingReceiptItems.findFirst({
                  columns: { outsourcingReceiptId: true },
                  where: eq(outsourcingReceiptItems.id, inspection.originId!),
                })
              )?.outsourcingReceiptId ?? null)
            : null;

        await this.supplierReturnsService.createFromIqcDisposition(tx, {
          qualityInspectionId: iqcId,
          qualityInspectionResultId: attempt.id,
          warehouseId: returnTarget.warehouseId,
          supplierId: inspection.supplierId!,
          itemId: inspection.itemId,
          quantity: returnTarget.quantity,
          purchaseOrderId: inspection.purchaseOrderId,
          inventoryReceiptId,
          outsourcingReceiptId,
          returnDate: vnToday(),
          userId,
        });
      }
    });
  }

  /** SL OK/NG chỉ hợp lệ khi `disposition = SORT` (E161/E162), và khi đó phải cộng đúng `quantity`
   *  của dòng IQC (E160, so bằng số nguyên đã scale — cả 3 giá trị đều `numeric`, cộng float thô
   *  không an toàn bằng). `result`/`disposition` QC toàn quyền chọn, không validate chéo ở đây. */
  private validateDecision(reqDto: ConfirmIqcReqDto, quantity: number): void {
    const hasSplit = reqDto.sortOkQty != null || reqDto.sortNgQty != null;

    if (reqDto.disposition !== IqcDisposition.SORT) {
      if (hasSplit) {
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

  /** `RETURN` trả cả lô (`quantity`); `SORT` chỉ trả phần NG đã tách — `validateDecision` đã đảm
   *  bảo `sortNgQty` có giá trị và cộng đúng `quantity` khi tới được đây. */
  private resolveReturnQuantity(
    inspection: { quantity: number },
    reqDto: ConfirmIqcReqDto,
  ): number {
    if (
      reqDto.disposition === IqcDisposition.SORT &&
      reqDto.sortNgQty != null
    ) {
      return reqDto.sortNgQty;
    }
    return inspection.quantity;
  }

  /** Kho nhận hàng trả — suy từ phiếu nhập liên quan trước, PO liên quan sau (cùng thứ tự
   *  `InventoryReceiptsService.resolveIqcSupplierId` suy `supplierId`). Dòng IQC xuất phát từ OS-IN
   *  (`originType = OUTSOURCING_RECEIPT_ITEM`, không có `inventoryReceiptId` lẫn `purchaseOrderId`
   *  — `outsourcing_receipts` không có cột kho, `docs/decisions/wip-not-stocked.md`) trả `null` —
   *  hợp lệ, không phải lỗi: `SupplierReturnsService.shouldPostStock` không bao giờ trừ tồn cho
   *  phiếu trả gốc OS-IN nên không cần kho. `E163` chỉ còn ném khi thực sự không suy được từ nguồn
   *  nào cả (không phải purchase, không phải OS-IN — dữ liệu bất thường). */
  private async resolveReturnWarehouseId(inspection: {
    originType: QualityInspectionOriginType;
    originId: string | null;
    purchaseOrderId: string | null;
  }): Promise<string | null> {
    if (
      inspection.originType ===
      QualityInspectionOriginType.OUTSOURCING_RECEIPT_ITEM
    ) {
      return null;
    }

    const inventoryReceiptId =
      inspection.originType === QualityInspectionOriginType.INVENTORY_RECEIPT
        ? inspection.originId
        : null;

    const [receipt, purchaseOrder] = await Promise.all([
      inventoryReceiptId
        ? this.db.query.inventoryReceipts.findFirst({
            columns: { warehouseId: true },
            where: eq(inventoryReceipts.id, inventoryReceiptId),
          })
        : Promise.resolve(null),
      inspection.purchaseOrderId
        ? this.db.query.purchaseOrders.findFirst({
            columns: { receiptWarehouseId: true },
            where: eq(purchaseOrders.id, inspection.purchaseOrderId),
          })
        : Promise.resolve(null),
    ]);

    const warehouseId =
      receipt?.warehouseId ?? purchaseOrder?.receiptWarehouseId ?? null;

    if (!warehouseId) {
      throw new AppException(ErrorCode.E163, HttpStatus.BAD_REQUEST);
    }

    return warehouseId;
  }

  private async ensureIqcSavable(iqcId: string): Promise<IqcSavableInspection> {
    const inspection = await this.db.query.qualityInspections.findFirst({
      columns: {
        quantity: true,
        status: true,
        requestedAt: true,
        originType: true,
        originId: true,
        purchaseOrderId: true,
        supplierId: true,
        itemId: true,
        productionJobId: true,
      },
      where: and(
        eq(qualityInspections.inspectionType, QualityInspectionType.IQC),
        eq(qualityInspections.id, iqcId),
      ),
    });

    if (!inspection) {
      throw new AppException(ErrorCode.E138, HttpStatus.NOT_FOUND);
    }

    if (inspection.status === QualityInspectionStatus.IN_PROGRESS) {
      throw new AppException(ErrorCode.E159, HttpStatus.CONFLICT);
    }

    return inspection;
  }

  private async ensureDepartmentExists(departmentId: string): Promise<void> {
    const existing = await this.db.query.departments.findFirst({
      columns: { id: true },
      where: eq(departments.id, departmentId),
    });

    if (!existing) {
      throw new AppException(ErrorCode.E014, HttpStatus.NOT_FOUND);
    }
  }

  /** Đường gỡ cho phiếu tạo nhầm — chỉ xoá được khi còn `NOT_INSPECTED` (DRAFT, chưa từng
   * `confirm`, nên chưa có attempt nào để mồ côi), khuôn `OqcService.deleteOqc` nhưng mint riêng
   * `E206` vì hai domain khác nhau. */
  async deleteIqc(iqcId: string): Promise<void> {
    const inspection = await this.db.query.qualityInspections.findFirst({
      columns: { status: true },
      where: and(
        eq(qualityInspections.inspectionType, QualityInspectionType.IQC),
        eq(qualityInspections.id, iqcId),
      ),
    });

    if (!inspection) {
      throw new AppException(ErrorCode.E138, HttpStatus.NOT_FOUND);
    }
    if (inspection.status !== QualityInspectionStatus.DRAFT) {
      throw new AppException(ErrorCode.E206, HttpStatus.CONFLICT);
    }

    await this.db
      .delete(qualityInspections)
      .where(eq(qualityInspections.id, iqcId));
  }

  /** Sửa lại 4 field ngữ cảnh (`inspectionStandard`/`inspectorName`/`measuringTools`/
   * `inspectionDate`) sau khi đã confirm — không đụng `inspectionLevel`/`aqlLevel`/`sampleSize`/
   * `defectQty`/`result`, những field quyết định PASS/FAIL vẫn khoá cứng sau confirm. Chỉ sửa
   * `quality_inspections` (bản "hiện hành") — không sinh attempt mới, đây không phải một lần kiểm. */
  async updateIqc(iqcId: string, reqDto: UpdateIqcReqDto): Promise<void> {
    await this.ensureIqcConfirmed(iqcId);

    await this.db
      .update(qualityInspections)
      .set({
        inspectionStandard: reqDto.inspectionStandard,
        inspectorName: reqDto.inspectorName,
        measuringTools: reqDto.measuringTools,
        requestedAt: reqDto.inspectionDate,
      })
      .where(eq(qualityInspections.id, iqcId));
  }

  private async ensureIqcConfirmed(iqcId: string): Promise<void> {
    const inspection = await this.db.query.qualityInspections.findFirst({
      columns: { id: true, status: true },
      where: and(
        eq(qualityInspections.inspectionType, QualityInspectionType.IQC),
        eq(qualityInspections.id, iqcId),
      ),
    });

    if (!inspection) {
      throw new AppException(ErrorCode.E138, HttpStatus.NOT_FOUND);
    }

    if (inspection.status === QualityInspectionStatus.DRAFT) {
      throw new AppException(ErrorCode.E144, HttpStatus.CONFLICT);
    }
  }

  private async generateIqcCode(
    tx: DbTransaction,
    inspectionDate: Date,
  ): Promise<string> {
    const [code] = await this.generateIqcCodes(tx, inspectionDate, 1);
    return code;
  }

  /** Cấp `quantity` mã liên tiếp trong năm của `inspectionDate` qua `generateDocumentSequences` —
   *  dùng được từ cả `generateIqcCode` (đơn, `quantity = 1`) lẫn `createInspectionsFromReceipt`/
   *  `createInspectionsFromOutsourcingReceipt` (N phiếu/lượt). */
  private async generateIqcCodes(
    tx: DbTransaction,
    inspectionDate: Date,
    quantity: number,
  ): Promise<string[]> {
    const year = inspectionDate.getFullYear();
    const sequences = await generateDocumentSequences(
      tx,
      DocumentType.IQC,
      year,
      quantity,
    );

    return sequences.map(
      (sequence) => `IQC-${year}-${String(sequence).padStart(5, '0')}`,
    );
  }

  private async ensureSupplierExists(supplierId: string): Promise<void> {
    const existing = await this.db.query.suppliers.findFirst({
      columns: { id: true },
      where: and(eq(suppliers.id, supplierId), isNull(suppliers.deletedAt)),
    });

    if (!existing) {
      throw new AppException(ErrorCode.E019, HttpStatus.NOT_FOUND);
    }
  }

  private async ensureItemExists(itemId: string): Promise<void> {
    const existing = await this.db.query.items.findFirst({
      columns: { id: true },
      where: and(eq(items.id, itemId), isNull(items.deletedAt)),
    });

    if (!existing) {
      throw new AppException(ErrorCode.E007, HttpStatus.NOT_FOUND);
    }
  }

  private async ensureInventoryReceiptExists(
    inventoryReceiptId: string,
  ): Promise<void> {
    const existing = await this.db.query.inventoryReceipts.findFirst({
      columns: { id: true },
      where: eq(inventoryReceipts.id, inventoryReceiptId),
    });

    if (!existing) {
      throw new AppException(ErrorCode.E096, HttpStatus.NOT_FOUND);
    }
  }

  private async ensurePurchaseOrderExists(
    purchaseOrderId: string,
  ): Promise<void> {
    const existing = await this.db.query.purchaseOrders.findFirst({
      columns: { id: true },
      where: eq(purchaseOrders.id, purchaseOrderId),
    });

    if (!existing) {
      throw new AppException(ErrorCode.E121, HttpStatus.NOT_FOUND);
    }
  }
}
