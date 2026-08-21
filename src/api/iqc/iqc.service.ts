import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { and, count, desc, eq, exists, isNull, or, sql } from 'drizzle-orm';

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
  departments,
  inventoryReceipts,
  IqcAttachmentKind,
  IqcDisposition,
  IqcResult,
  IqcStatus,
  items,
  purchaseOrders,
  qcAttachments,
  QcKind,
  qualityInspections,
  type QualityInspectionSelect,
  suppliers,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { FilesService } from '../files/files.service';
import { SupplierReturnsService } from '../supplier-returns/supplier-returns.service';
import { ConfirmIqcReqDto } from './dto/confirm-iqc.req.dto';
import { CreateIqcReqDto } from './dto/create-iqc.req.dto';
import { GetIqcsReqDto } from './dto/get-iqcs.req.dto';
import { IqcResDto } from './dto/iqc.res.dto';
import { IqcStatsResDto } from './dto/iqc-stats.res.dto';
import { PageIqcResDto } from './dto/page-iqc.res.dto';
import { UpdateIqcReqDto } from './dto/update-iqc.req.dto';
import { resolveAqlPlan } from './iqc-aql.constant';

// `supplierId` ghi đè non-null — cột vật lý nullable (dùng chung với OUTGOING) nhưng
// `chk_quality_inspections_incoming_supplier` đảm bảo luôn có giá trị ở dòng `kind = INCOMING`, tập query này luôn
// lọc (`.claude/rules/service.md`, mẫu `XSelect` + field ghi đè).
type IqcSavableInspection = Pick<
  QualityInspectionSelect,
  | 'quantity'
  | 'status'
  | 'confirmedAt'
  | 'resolvedAt'
  | 'inventoryReceiptId'
  | 'outsourcingReceiptId'
  | 'purchaseOrderId'
  | 'itemId'
> & { supplierId: string };

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
    const materialKeyword = reqDto.materialKeyword
      ? `%${reqDto.materialKeyword}%`
      : undefined;
    const poKeyword = reqDto.poCode ? `%${reqDto.poCode}%` : undefined;
    const nkKeyword = reqDto.nkCode ? `%${reqDto.nkCode}%` : undefined;

    const where = and(
      eq(qualityInspections.kind, QcKind.INCOMING),
      keyword ? unaccentILike(qualityInspections.code, keyword) : undefined,
      reqDto.supplierId
        ? eq(qualityInspections.supplierId, reqDto.supplierId)
        : undefined,
      reqDto.result ? eq(qualityInspections.result, reqDto.result) : undefined,
      reqDto.disposition
        ? eq(qualityInspections.disposition, reqDto.disposition)
        : undefined,
      reqDto.status ? eq(qualityInspections.status, reqDto.status) : undefined,
      materialKeyword
        ? exists(
            this.db
              .select({ one: sql`1` })
              .from(items)
              .where(
                and(
                  eq(items.id, qualityInspections.itemId),
                  or(
                    unaccentILike(items.name, materialKeyword),
                    unaccentILike(items.code, materialKeyword),
                  ),
                ),
              ),
          )
        : undefined,
      poKeyword
        ? exists(
            this.db
              .select({ one: sql`1` })
              .from(purchaseOrders)
              .where(
                and(
                  eq(purchaseOrders.id, qualityInspections.purchaseOrderId),
                  unaccentILike(purchaseOrders.code, poKeyword),
                ),
              ),
          )
        : undefined,
      nkKeyword
        ? exists(
            this.db
              .select({ one: sql`1` })
              .from(inventoryReceipts)
              .where(
                and(
                  eq(
                    inventoryReceipts.id,
                    qualityInspections.inventoryReceiptId,
                  ),
                  unaccentILike(inventoryReceipts.code, nkKeyword),
                ),
              ),
          )
        : undefined,
    );

    const [entities, countRows] = await Promise.all([
      this.db.query.qualityInspections.findMany({
        where,
        limit: reqDto.limit,
        offset: reqDto.offset,
        orderBy: desc(qualityInspections.createdAt),
        with: {
          item: { with: { unit: true } },
          supplier: true,
          inventoryReceipt: true,
          purchaseOrder: true,
          productionJob: true,
          productionJobOperation: true,
          creatorBy: true,
        },
      }),
      this.db.select({ total: count() }).from(qualityInspections).where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(PageIqcResDto, entities, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(countRows[0]?.total ?? 0, reqDto),
    );
  }

  async getIqcStats(): Promise<IqcStatsResDto> {
    const [row] = await this.db
      .select({
        total: count(),
        notInspected: count(
          sql`case when ${qualityInspections.status} = ${IqcStatus.NOT_INSPECTED} then 1 end`,
        ),
        pass: count(
          sql`case when ${qualityInspections.result} = ${IqcResult.PASS} then 1 end`,
        ),
        fail: count(
          sql`case when ${qualityInspections.result} = ${IqcResult.FAIL} then 1 end`,
        ),
        pending: count(
          sql`case when ${qualityInspections.status} = ${IqcStatus.PENDING} then 1 end`,
        ),
        waitingReturn: count(
          sql`case when ${qualityInspections.status} = ${IqcStatus.WAITING_RETURN} then 1 end`,
        ),
        completed: count(
          sql`case when ${qualityInspections.status} = ${IqcStatus.COMPLETED} then 1 end`,
        ),
      })
      .from(qualityInspections)
      .where(eq(qualityInspections.kind, QcKind.INCOMING));

    return plainToInstance(IqcStatsResDto, row, {
      excludeExtraneousValues: true,
    });
  }

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

    await this.db.transaction(async (tx) => {
      const code = await this.generateIqcCode(tx, reqDto.inspectionDate);

      await tx.insert(qualityInspections).values({
        ...reqDto,
        code,
        kind: QcKind.INCOMING,
        status,
        createdBy: userId,
      });
    });
  }

  /** Sinh phiếu IQC cho từng dòng phiếu nhập khi phiếu được xác nhận có yêu cầu QC — đường ghi tự
   *  động duy nhất vào `quality_inspections` (`kind = INCOMING`). Gọi trong transaction của
   *  `InventoryReceiptsService.confirmInventoryReceipt`; xem
   *  `docs/workflows/receipt-confirmation.md`. */
  async createInspectionsFromReceipt(
    tx: DbTransaction,
    params: {
      inventoryReceiptId: string;
      purchaseOrderId: string | null;
      supplierId: string;
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
        code: codes[index],
        kind: QcKind.INCOMING,
        inventoryReceiptId: params.inventoryReceiptId,
        purchaseOrderId: params.purchaseOrderId,
        supplierId: params.supplierId,
        itemId: line.itemId,
        quantity: line.quantity,
        inspectionDate: params.inspectionDate,
        status: IqcStatus.NOT_INSPECTED,
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
        code: codes[index],
        kind: QcKind.INCOMING,
        outsourcingReceiptId: params.outsourcingReceiptId,
        outsourcingReceiptItemId: line.outsourcingReceiptItemId,
        productionJobId: line.productionJobId,
        productionJobOperationId: line.productionJobOperationId,
        supplierId: params.supplierId,
        itemId: line.itemId,
        quantity: line.quantity,
        inspectionDate: params.inspectionDate,
        status: IqcStatus.NOT_INSPECTED,
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
        eq(qualityInspections.kind, QcKind.INCOMING),
        eq(qualityInspections.inventoryReceiptId, inventoryReceiptId),
      ),
    });

    return (
      inspections.length > 0 &&
      inspections.every(
        (inspection) => inspection.status === IqcStatus.COMPLETED,
      )
    );
  }

  async getIqc(iqcId: string): Promise<IqcResDto> {
    const row = await this.db.query.qualityInspections.findFirst({
      where: and(
        eq(qualityInspections.kind, QcKind.INCOMING),
        eq(qualityInspections.id, iqcId),
      ),
      with: {
        item: { with: { unit: true } },
        supplier: true,
        inventoryReceipt: true,
        outsourcingReceipt: true,
        purchaseOrder: true,
        qcDepartment: true,
        productionJob: true,
        productionJobOperation: true,
        creatorBy: true,
        confirmerBy: true,
        resolverBy: true,
        attachments: { with: { file: true } },
        supplierReturns: { columns: { id: true, code: true, status: true } },
      },
    });

    if (!row) {
      throw new AppException(ErrorCode.E138, HttpStatus.NOT_FOUND);
    }

    const plan =
      row.inspectionLevel && row.aqlLevel != null
        ? resolveAqlPlan(row.quantity, row.inspectionLevel, row.aqlLevel)
        : undefined;

    return plainToInstance(
      IqcResDto,
      {
        ...row,
        ac: plan?.ac ?? null,
        re: plan?.re ?? null,
        qcEvidence: row.attachments.filter(
          (attachment) => attachment.kind === IqcAttachmentKind.QC_EVIDENCE,
        ),
        dispositionEvidence: row.attachments.filter(
          (attachment) =>
            attachment.kind === IqcAttachmentKind.DISPOSITION_EVIDENCE,
        ),
        supplierReturn: row.supplierReturns[0] ?? null,
      },
      { excludeExtraneousValues: true },
    );
  }

  /** Xem `docs/domains/quality.md` — quy tắc suy `status`, dùng chung cho tạo lẫn lưu kết quả QC. */
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

  /** Nút "Lưu" duy nhất của trang chi tiết IQC — ghi đè toàn bộ quyết định QC mỗi lần gọi, gọi
   *  lại được nhiều lần (không dùng-một-lần như trước) trừ khi dòng đã `WAITING_RETURN` (đã chốt
   *  đường trả NCC — `E159`). Gộp cả phần xác nhận AQL lẫn phần chọn phương án xử lý FAIL (route
   *  `POST /iqc/:iqcId/resolve` cũ đã xoá) vì ảnh mẫu chỉ có một nút Lưu điều khiển cả trang. */
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
    const isPass = reqDto.result === IqcResult.PASS;

    // Suy kho trả hàng NGOÀI transaction — thuần đọc, và phải fail sớm (E163) trước khi ghi bất
    // cứ gì nếu không suy được, thay vì rollback nửa chừng.
    const returnTarget =
      status === IqcStatus.WAITING_RETURN
        ? {
            warehouseId: await this.resolveReturnWarehouseId(inspection),
            quantity: this.resolveReturnQuantity(inspection, reqDto),
          }
        : null;

    const isFirstConfirm = inspection.confirmedAt === null;
    const isFirstResolve =
      !isPass && !!reqDto.disposition && !inspection.resolvedAt;

    await this.db.transaction(async (tx) => {
      await tx
        .update(qualityInspections)
        .set({
          inspectionLevel: reqDto.inspectionLevel,
          aqlLevel: reqDto.aqlLevel,
          sampleSize: reqDto.sampleSize,
          defectQty: reqDto.defectQty,
          inspectionStandard: reqDto.inspectionStandard ?? null,
          inspectorName: reqDto.inspectorName ?? null,
          measuringTools: reqDto.measuringTools ?? null,
          inspectionDate: reqDto.inspectionDate,
          result: reqDto.result,
          resultNote: reqDto.resultNote ?? null,
          qcDepartmentId: reqDto.qcDepartmentId ?? null,
          status,
          // Lần confirm đầu tiên là mốc nghiệp vụ — sửa lại kết quả sau đó không ghi đè, đúng như
          // `updatedAt` đã ghi lại việc sửa. `undefined` bị Drizzle bỏ qua khỏi SET, giữ nguyên
          // giá trị cột hiện có.
          confirmedBy: isFirstConfirm ? userId : undefined,
          confirmedAt: isFirstConfirm ? new Date() : undefined,
          // PASS ép null toàn bộ nhóm disposition trong cùng 1 UPDATE — CHECK
          // `chk_quality_inspections_disposition_requires_fail` chỉ đánh giá cuối câu lệnh nên không bao giờ ở
          // trạng thái vi phạm tạm thời khi lật FAIL → PASS.
          disposition: isPass ? null : (reqDto.disposition ?? null),
          sortOkQty:
            !isPass && reqDto.disposition === IqcDisposition.SORT
              ? (reqDto.sortOkQty ?? null)
              : null,
          sortNgQty:
            !isPass && reqDto.disposition === IqcDisposition.SORT
              ? (reqDto.sortNgQty ?? null)
              : null,
          dispositionNote: isPass ? null : (reqDto.dispositionNote ?? null),
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
        .where(eq(qualityInspections.id, iqcId));

      await this.replaceAttachments(
        tx,
        iqcId,
        IqcAttachmentKind.QC_EVIDENCE,
        reqDto.qcEvidenceFileIds ?? [],
      );
      await this.replaceAttachments(
        tx,
        iqcId,
        IqcAttachmentKind.DISPOSITION_EVIDENCE,
        isPass ? [] : (reqDto.dispositionEvidenceFileIds ?? []),
      );

      // Đây là nơi DUY NHẤT một dòng IQC chuyển sang WAITING_RETURN — `ensureIqcSavable` khoá
      // mọi lần confirm sau đó (E159), nên không cần guard chống tạo phiếu trả trùng.
      if (returnTarget) {
        await this.supplierReturnsService.createFromIqcDisposition(tx, {
          iqcId,
          warehouseId: returnTarget.warehouseId,
          supplierId: inspection.supplierId,
          itemId: inspection.itemId,
          quantity: returnTarget.quantity,
          purchaseOrderId: inspection.purchaseOrderId,
          inventoryReceiptId: inspection.inventoryReceiptId,
          outsourcingReceiptId: inspection.outsourcingReceiptId,
          returnDate: new Date(),
          userId,
        });
      }
    });
  }

  /** `result === PASS && disposition` (E139); SL OK/NG chỉ hợp lệ khi `disposition = SORT`
   *  (E161/E162), và khi đó phải cộng đúng `quantity` của dòng IQC (E160, so bằng số nguyên đã
   *  scale — cả 3 giá trị đều `numeric`, cộng float thô không an toàn bằng). */
  private validateDecision(reqDto: ConfirmIqcReqDto, quantity: number): void {
    if (reqDto.result === IqcResult.PASS && reqDto.disposition) {
      throw new AppException(ErrorCode.E139, HttpStatus.BAD_REQUEST);
    }

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
   *  (không có cả hai nguồn trên, `outsourcing_receipts` không có cột kho —
   *  `docs/decisions/wip-not-stocked.md`) trả `null` — hợp lệ, không phải lỗi:
   *  `SupplierReturnsService.shouldPostStock` không bao giờ trừ tồn cho phiếu trả gốc OS-IN nên
   *  không cần kho. `E163` chỉ còn ném khi thực sự không suy được từ nguồn nào cả (không phải
   *  purchase, không phải OS-IN — dữ liệu bất thường). */
  private async resolveReturnWarehouseId(inspection: {
    inventoryReceiptId: string | null;
    purchaseOrderId: string | null;
    outsourcingReceiptId: string | null;
  }): Promise<string | null> {
    if (inspection.outsourcingReceiptId) {
      return null;
    }

    const [receipt, purchaseOrder] = await Promise.all([
      inspection.inventoryReceiptId
        ? this.db.query.inventoryReceipts.findFirst({
            columns: { warehouseId: true },
            where: eq(inventoryReceipts.id, inspection.inventoryReceiptId),
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

  /** Replace-all theo `(inspectionId, kind)` — 2 bộ bằng chứng độc lập nhau. Bắt buộc `tx` để
   *  tránh ghi ra ngoài transaction. */
  private async replaceAttachments(
    tx: DbTransaction,
    iqcId: string,
    kind: IqcAttachmentKind,
    fileIds: string[],
  ): Promise<void> {
    await tx
      .delete(qcAttachments)
      .where(
        and(
          eq(qcAttachments.inspectionId, iqcId),
          eq(qcAttachments.kind, kind),
        ),
      );

    if (fileIds.length) {
      await tx
        .insert(qcAttachments)
        .values(
          fileIds.map((fileId) => ({ inspectionId: iqcId, fileId, kind })),
        );
    }
  }

  private async ensureIqcSavable(iqcId: string): Promise<IqcSavableInspection> {
    const inspection = await this.db.query.qualityInspections.findFirst({
      columns: {
        id: true,
        quantity: true,
        status: true,
        confirmedAt: true,
        resolvedAt: true,
        inventoryReceiptId: true,
        outsourcingReceiptId: true,
        purchaseOrderId: true,
        supplierId: true,
        itemId: true,
      },
      where: and(
        eq(qualityInspections.kind, QcKind.INCOMING),
        eq(qualityInspections.id, iqcId),
      ),
    });

    if (!inspection) {
      throw new AppException(ErrorCode.E138, HttpStatus.NOT_FOUND);
    }

    if (inspection.status === IqcStatus.WAITING_RETURN) {
      throw new AppException(ErrorCode.E159, HttpStatus.CONFLICT);
    }

    // `chk_quality_inspections_incoming_supplier` đảm bảo non-null cho dòng `kind = INCOMING` vừa lọc ở trên.
    return { ...inspection, supplierId: inspection.supplierId! };
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

  /** Đường gỡ cho phiếu tạo nhầm — chỉ xoá được khi còn `NOT_INSPECTED` (chưa từng `confirm`),
   * khuôn `OqcService.deleteOqc` nhưng mint riêng `E206` vì hai domain khác nhau. */
  async deleteIqc(iqcId: string): Promise<void> {
    const inspection = await this.db.query.qualityInspections.findFirst({
      columns: { status: true },
      where: and(
        eq(qualityInspections.kind, QcKind.INCOMING),
        eq(qualityInspections.id, iqcId),
      ),
    });

    if (!inspection) {
      throw new AppException(ErrorCode.E138, HttpStatus.NOT_FOUND);
    }
    if (inspection.status !== IqcStatus.NOT_INSPECTED) {
      throw new AppException(ErrorCode.E206, HttpStatus.CONFLICT);
    }

    await this.db
      .delete(qualityInspections)
      .where(eq(qualityInspections.id, iqcId));
  }

  /** Sửa lại 4 field ngữ cảnh (`inspectionStandard`/`inspectorName`/`measuringTools`/
   * `inspectionDate`) sau khi đã confirm — không đụng `inspectionLevel`/`aqlLevel`/`sampleSize`/
   * `defectQty`/`result`, những field quyết định PASS/FAIL vẫn khoá cứng sau confirm. */
  async updateIqc(iqcId: string, reqDto: UpdateIqcReqDto): Promise<void> {
    await this.ensureIqcConfirmed(iqcId);

    await this.db
      .update(qualityInspections)
      .set({
        inspectionStandard: reqDto.inspectionStandard,
        inspectorName: reqDto.inspectorName,
        measuringTools: reqDto.measuringTools,
        inspectionDate: reqDto.inspectionDate,
      })
      .where(eq(qualityInspections.id, iqcId));
  }

  private async ensureIqcConfirmed(iqcId: string): Promise<void> {
    const inspection = await this.db.query.qualityInspections.findFirst({
      columns: { id: true, status: true },
      where: and(
        eq(qualityInspections.kind, QcKind.INCOMING),
        eq(qualityInspections.id, iqcId),
      ),
    });

    if (!inspection) {
      throw new AppException(ErrorCode.E138, HttpStatus.NOT_FOUND);
    }

    if (inspection.status === IqcStatus.NOT_INSPECTED) {
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
