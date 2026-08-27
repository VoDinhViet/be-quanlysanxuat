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
import { vnToday } from '../../database/vn-date.util';
import {
  departments,
  inventoryReceipts,
  IqcDisposition,
  IqcResult,
  IqcStatus,
  items,
  purchaseOrders,
  qcInspections,
  QcFileKind,
  QcKind,
  qcRequests,
  type QcRequestSelect,
  suppliers,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { FilesService } from '../files/files.service';
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
import { closeJobIfQcCovered } from '../oqc/oqc.query';

// `supplierId` có thể null từ BUG-065 (dòng INCOMING sinh từ phiếu RETURN gắn khách hàng dùng
// `clientId` thay thế, loại trừ lẫn nhau — `chk_qc_requests_supplier_client_exclusive`). `confirmIqc`
// tự chặn (`E254`) disposition SORT/RETURN khi không có `supplierId`, nên `supplierReturnsService
// .createFromIqcDisposition` chỉ bao giờ được gọi với `supplierId` đã biết chắc khác null.
type IqcSavableRequest = Pick<
  QcRequestSelect,
  | 'quantity'
  | 'status'
  | 'inspectionDate'
  | 'inventoryReceiptId'
  | 'outsourcingReceiptId'
  | 'purchaseOrderId'
  | 'supplierId'
  | 'itemId'
  | 'productionJobId'
>;

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
      eq(qcRequests.kind, QcKind.INCOMING),
      keyword ? unaccentILike(qcRequests.code, keyword) : undefined,
      reqDto.supplierId
        ? eq(qcRequests.supplierId, reqDto.supplierId)
        : undefined,
      reqDto.clientId ? eq(qcRequests.clientId, reqDto.clientId) : undefined,
      reqDto.result ? eq(qcRequests.result, reqDto.result) : undefined,
      reqDto.disposition
        ? eq(qcRequests.disposition, reqDto.disposition)
        : undefined,
      reqDto.status ? eq(qcRequests.status, reqDto.status) : undefined,
      materialKeyword
        ? exists(
            this.db
              .select({ one: sql`1` })
              .from(items)
              .where(
                and(
                  eq(items.id, qcRequests.itemId),
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
                  eq(purchaseOrders.id, qcRequests.purchaseOrderId),
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
                  eq(inventoryReceipts.id, qcRequests.inventoryReceiptId),
                  unaccentILike(inventoryReceipts.code, nkKeyword),
                ),
              ),
          )
        : undefined,
    );

    const [entities, countRows] = await Promise.all([
      this.db.query.qcRequests.findMany({
        where,
        limit: reqDto.limit,
        offset: reqDto.offset,
        orderBy: desc(qcRequests.createdAt),
        with: {
          item: { with: { unit: true } },
          supplier: true,
          client: true,
          inventoryReceipt: true,
          purchaseOrder: true,
          productionJob: true,
          productionJobOperation: true,
          creatorBy: true,
        },
      }),
      this.db.select({ total: count() }).from(qcRequests).where(where),
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
          sql`case when ${qcRequests.status} = ${IqcStatus.NOT_INSPECTED} then 1 end`,
        ),
        pass: count(
          sql`case when ${qcRequests.result} = ${IqcResult.PASS} then 1 end`,
        ),
        fail: count(
          sql`case when ${qcRequests.result} = ${IqcResult.FAIL} then 1 end`,
        ),
        pending: count(
          sql`case when ${qcRequests.status} = ${IqcStatus.PENDING} then 1 end`,
        ),
        waitingReturn: count(
          sql`case when ${qcRequests.status} = ${IqcStatus.WAITING_RETURN} then 1 end`,
        ),
        completed: count(
          sql`case when ${qcRequests.status} = ${IqcStatus.COMPLETED} then 1 end`,
        ),
      })
      .from(qcRequests)
      .where(eq(qcRequests.kind, QcKind.INCOMING));

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
   * tạo cả request lẫn attempt #1 cùng lúc, thiếu `result` thì chỉ tạo request `NOT_INSPECTED`
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

    await this.db.transaction(async (tx) => {
      const code = await this.generateIqcCode(tx, reqDto.inspectionDate);

      const [request] = await tx
        .insert(qcRequests)
        .values({
          ...reqDto,
          code,
          kind: QcKind.INCOMING,
          status,
          disposition: reqDto.result ? reqDto.disposition : undefined,
          attemptCount: reqDto.result ? 1 : 0,
          createdBy: userId,
        })
        .returning({ id: qcRequests.id });

      if (reqDto.result) {
        await tx.insert(qcInspections).values({
          qcRequestId: request.id,
          kind: QcKind.INCOMING,
          quantity: reqDto.quantity,
          attemptNo: 1,
          inspectionDate: reqDto.inspectionDate,
          result: reqDto.result,
          disposition: reqDto.disposition,
          resultingStatus: status,
          confirmedBy: userId,
        });
      }
    });
  }

  /** Sinh phiếu IQC cho từng dòng phiếu nhập khi phiếu được xác nhận có yêu cầu QC — đường ghi tự
   *  động duy nhất vào `qc_requests` (`kind = INCOMING`), luôn `NOT_INSPECTED` nên không sinh
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

    await tx.insert(qcRequests).values(
      params.lines.map((line, index) => ({
        code: codes[index],
        kind: QcKind.INCOMING,
        inventoryReceiptId: params.inventoryReceiptId,
        purchaseOrderId: params.purchaseOrderId,
        supplierId: params.supplierId,
        clientId: params.clientId,
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

    await tx.insert(qcRequests).values(
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
    const inspections = await tx.query.qcRequests.findMany({
      columns: { status: true },
      where: and(
        eq(qcRequests.kind, QcKind.INCOMING),
        eq(qcRequests.inventoryReceiptId, inventoryReceiptId),
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
    const [row, latestAttempt] = await Promise.all([
      this.db.query.qcRequests.findFirst({
        where: and(
          eq(qcRequests.kind, QcKind.INCOMING),
          eq(qcRequests.id, iqcId),
        ),
        with: {
          item: { with: { unit: true } },
          supplier: true,
          client: true,
          inventoryReceipt: true,
          outsourcingReceipt: true,
          purchaseOrder: true,
          qcDepartment: true,
          productionJob: true,
          productionJobOperation: true,
          creatorBy: true,
          confirmerBy: true,
          resolverBy: true,
          supplierReturns: { columns: { id: true, code: true, status: true } },
        },
      }),
      this.getLatestAttempt(iqcId),
    ]);

    if (!row) {
      throw new AppException(ErrorCode.E138, HttpStatus.NOT_FOUND);
    }

    const qcFiles = latestAttempt?.files ?? [];

    return plainToInstance(
      IqcResDto,
      {
        ...row,
        ac: latestAttempt?.acceptanceNumber ?? null,
        re: latestAttempt?.rejectionNumber ?? null,
        qcEvidence: qcFiles.filter(
          (qcFile) => qcFile.kind === QcFileKind.QC_EVIDENCE,
        ),
        dispositionEvidence: qcFiles.filter(
          (qcFile) => qcFile.kind === QcFileKind.DISPOSITION_EVIDENCE,
        ),
        supplierReturn: row.supplierReturns[0] ?? null,
      },
      { excludeExtraneousValues: true },
    );
  }

  /** Lần kiểm mới nhất của một request, kèm bằng chứng — chỉ phục vụ `getIqc`: `ac`/`re` hiển thị
   * là snapshot đã dùng lúc kiểm, không tính lại từ `qc_aql_rules` hiện hành
   * (`docs/decisions/qc-aql-master-data.md`). */
  private async getLatestAttempt(qcRequestId: string) {
    return this.db.query.qcInspections.findFirst({
      where: eq(qcInspections.qcRequestId, qcRequestId),
      orderBy: desc(qcInspections.attemptNo),
      with: { files: { with: { file: true } } },
    });
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

  /** Nút "Lưu" duy nhất của trang chi tiết IQC — gộp cả phần xác nhận AQL lẫn phần chọn phương án
   * xử lý FAIL (route `POST /iqc/:iqcId/resolve` cũ đã xoá). Gọi lại được nhiều lần trừ khi request
   * đã `WAITING_RETURN` (`E159`) — mỗi lần gọi sinh **1 dòng `qc_inspections` mới** (attempt), không
   * còn `UPDATE` đè lên chính nó như trước khi tách request/attempt
   * (`docs/decisions/qc-request-attempt-split.md`); `qc_requests` chỉ giữ mirror của attempt mới
   * nhất — nguồn duy nhất mọi gate/list/detail khác đang đọc. */
  async confirmIqc(
    iqcId: string,
    reqDto: ConfirmIqcReqDto,
    userId: string,
  ): Promise<void> {
    const request = await this.ensureIqcSavable(iqcId);

    this.validateDecision(reqDto, request.quantity);

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
    if (status === IqcStatus.WAITING_RETURN && !request.supplierId) {
      throw new AppException(ErrorCode.E254, HttpStatus.BAD_REQUEST);
    }

    const isPass = reqDto.result === IqcResult.PASS;
    const inspectionDate = reqDto.inspectionDate ?? request.inspectionDate;
    const disposition = isPass ? null : (reqDto.disposition ?? null);
    const dispositionNote = isPass ? null : (reqDto.dispositionNote ?? null);
    const isSort = disposition === IqcDisposition.SORT;
    const sortOkQty = isSort ? (reqDto.sortOkQty ?? null) : null;
    const sortNgQty = isSort ? (reqDto.sortNgQty ?? null) : null;

    // Phần quyết định QC của lần confirm này — ghi y hệt vào cả dòng attempt mới lẫn mirror trên
    // `qc_requests`, viết một lần để hai bên không lệch nhau.
    const decision = {
      inspectionLevel: reqDto.inspectionLevel,
      aqlLevel: reqDto.aqlLevel,
      sampleSize: reqDto.sampleSize,
      defectQty: reqDto.defectQty,
      inspectionDate,
      result: reqDto.result,
      resultNote: reqDto.resultNote ?? null,
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
            warehouseId: await this.resolveReturnWarehouseId(request),
            quantity: this.resolveReturnQuantity(request, reqDto),
          }
        : null;

    const plan = await resolveAqlPlan(
      this.db,
      request.quantity,
      reqDto.inspectionLevel,
      reqDto.aqlLevel,
    );

    await this.db.transaction(async (tx) => {
      // Khoá request để cấp `attemptNo` tuần tự và đọc đúng `confirmedAt`/`resolvedAt` hiện hành —
      // không có lock, hai lần confirm song song có thể tính trùng `attemptNo`
      // (`uq_qc_inspections_request_id_attempt_no` biến đua thành lỗi constraint thay vì ghi trùng,
      // nhưng lock tránh luôn ca đó) hoặc cùng nghĩ mình là "lần confirm đầu tiên".
      const [locked] = await tx
        .select({
          confirmedAt: qcRequests.confirmedAt,
          resolvedAt: qcRequests.resolvedAt,
          status: qcRequests.status,
          attemptCount: qcRequests.attemptCount,
        })
        .from(qcRequests)
        .where(eq(qcRequests.id, iqcId))
        .for('update');

      if (!locked || locked.status === IqcStatus.WAITING_RETURN) {
        throw new AppException(ErrorCode.E159, HttpStatus.CONFLICT);
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
          qcRequestId: iqcId,
          kind: QcKind.INCOMING,
          quantity: request.quantity,
          attemptNo,
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
        .where(eq(qcRequests.id, iqcId));

      // Công đoạn `OUTSOURCE` neo IQC vào `productionJobId` (`getJobQcCoverage` gộp chung IQC/OQC,
      // `docs/decisions/qc-single-table.md`) — dòng IQC này có thể là dòng QC cuối cùng đóng Job,
      // không chỉ OQC mới làm được việc đó. Xem `docs/decisions/production-lifecycle-closing.md`.
      if (status === IqcStatus.COMPLETED && request.productionJobId) {
        await closeJobIfQcCovered(tx, request.productionJobId);
      }

      await linkQcFiles(
        tx,
        attempt.id,
        QcFileKind.QC_EVIDENCE,
        reqDto.qcEvidenceFileIds ?? [],
      );
      await linkQcFiles(
        tx,
        attempt.id,
        QcFileKind.DISPOSITION_EVIDENCE,
        isPass ? [] : (reqDto.dispositionEvidenceFileIds ?? []),
      );

      // Đây là nơi DUY NHẤT một request IQC chuyển sang WAITING_RETURN — khoá lại mọi lần confirm
      // sau đó (E159), nên không cần guard chống tạo phiếu trả trùng. `returnTarget` khác null chỉ
      // khi `status = WAITING_RETURN`, guard E254 ở trên đã đảm bảo `supplierId` khác null lúc đó.
      if (returnTarget) {
        await this.supplierReturnsService.createFromIqcDisposition(tx, {
          iqcId,
          qcInspectionId: attempt.id,
          warehouseId: returnTarget.warehouseId,
          supplierId: request.supplierId!,
          itemId: request.itemId,
          quantity: returnTarget.quantity,
          purchaseOrderId: request.purchaseOrderId,
          inventoryReceiptId: request.inventoryReceiptId,
          outsourcingReceiptId: request.outsourcingReceiptId,
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
    request: { quantity: number },
    reqDto: ConfirmIqcReqDto,
  ): number {
    if (
      reqDto.disposition === IqcDisposition.SORT &&
      reqDto.sortNgQty != null
    ) {
      return reqDto.sortNgQty;
    }
    return request.quantity;
  }

  /** Kho nhận hàng trả — suy từ phiếu nhập liên quan trước, PO liên quan sau (cùng thứ tự
   *  `InventoryReceiptsService.resolveIqcSupplierId` suy `supplierId`). Dòng IQC xuất phát từ OS-IN
   *  (không có cả hai nguồn trên, `outsourcing_receipts` không có cột kho —
   *  `docs/decisions/wip-not-stocked.md`) trả `null` — hợp lệ, không phải lỗi:
   *  `SupplierReturnsService.shouldPostStock` không bao giờ trừ tồn cho phiếu trả gốc OS-IN nên
   *  không cần kho. `E163` chỉ còn ném khi thực sự không suy được từ nguồn nào cả (không phải
   *  purchase, không phải OS-IN — dữ liệu bất thường). */
  private async resolveReturnWarehouseId(request: {
    inventoryReceiptId: string | null;
    purchaseOrderId: string | null;
    outsourcingReceiptId: string | null;
  }): Promise<string | null> {
    if (request.outsourcingReceiptId) {
      return null;
    }

    const [receipt, purchaseOrder] = await Promise.all([
      request.inventoryReceiptId
        ? this.db.query.inventoryReceipts.findFirst({
            columns: { warehouseId: true },
            where: eq(inventoryReceipts.id, request.inventoryReceiptId),
          })
        : Promise.resolve(null),
      request.purchaseOrderId
        ? this.db.query.purchaseOrders.findFirst({
            columns: { receiptWarehouseId: true },
            where: eq(purchaseOrders.id, request.purchaseOrderId),
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

  private async ensureIqcSavable(iqcId: string): Promise<IqcSavableRequest> {
    const request = await this.db.query.qcRequests.findFirst({
      columns: {
        quantity: true,
        status: true,
        inspectionDate: true,
        inventoryReceiptId: true,
        outsourcingReceiptId: true,
        purchaseOrderId: true,
        supplierId: true,
        itemId: true,
        productionJobId: true,
      },
      where: and(
        eq(qcRequests.kind, QcKind.INCOMING),
        eq(qcRequests.id, iqcId),
      ),
    });

    if (!request) {
      throw new AppException(ErrorCode.E138, HttpStatus.NOT_FOUND);
    }

    if (request.status === IqcStatus.WAITING_RETURN) {
      throw new AppException(ErrorCode.E159, HttpStatus.CONFLICT);
    }

    return request;
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

  /** Đường gỡ cho phiếu tạo nhầm — chỉ xoá được khi còn `NOT_INSPECTED` (chưa từng `confirm`, nên
   * chưa có attempt nào để mồ côi), khuôn `OqcService.deleteOqc` nhưng mint riêng `E206` vì hai
   * domain khác nhau. */
  async deleteIqc(iqcId: string): Promise<void> {
    const request = await this.db.query.qcRequests.findFirst({
      columns: { status: true },
      where: and(
        eq(qcRequests.kind, QcKind.INCOMING),
        eq(qcRequests.id, iqcId),
      ),
    });

    if (!request) {
      throw new AppException(ErrorCode.E138, HttpStatus.NOT_FOUND);
    }
    if (request.status !== IqcStatus.NOT_INSPECTED) {
      throw new AppException(ErrorCode.E206, HttpStatus.CONFLICT);
    }

    await this.db.delete(qcRequests).where(eq(qcRequests.id, iqcId));
  }

  /** Sửa lại 4 field ngữ cảnh (`inspectionStandard`/`inspectorName`/`measuringTools`/
   * `inspectionDate`) sau khi đã confirm — không đụng `inspectionLevel`/`aqlLevel`/`sampleSize`/
   * `defectQty`/`result`, những field quyết định PASS/FAIL vẫn khoá cứng sau confirm. Chỉ sửa
   * `qc_requests` (bản "hiện hành") — không sinh attempt mới, đây không phải một lần kiểm. */
  async updateIqc(iqcId: string, reqDto: UpdateIqcReqDto): Promise<void> {
    await this.ensureIqcConfirmed(iqcId);

    await this.db
      .update(qcRequests)
      .set({
        inspectionStandard: reqDto.inspectionStandard,
        inspectorName: reqDto.inspectorName,
        measuringTools: reqDto.measuringTools,
        inspectionDate: reqDto.inspectionDate,
      })
      .where(eq(qcRequests.id, iqcId));
  }

  private async ensureIqcConfirmed(iqcId: string): Promise<void> {
    const request = await this.db.query.qcRequests.findFirst({
      columns: { id: true, status: true },
      where: and(
        eq(qcRequests.kind, QcKind.INCOMING),
        eq(qcRequests.id, iqcId),
      ),
    });

    if (!request) {
      throw new AppException(ErrorCode.E138, HttpStatus.NOT_FOUND);
    }

    if (request.status === IqcStatus.NOT_INSPECTED) {
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
