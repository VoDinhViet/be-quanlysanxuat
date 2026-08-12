import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import {
  and,
  count,
  desc,
  eq,
  exists,
  gte,
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
import type { Database } from '../../database/database.type';
import {
  inventoryReceipts,
  IqcDisposition,
  iqcInspections,
  IqcResult,
  IqcStatus,
  items,
  purchaseOrders,
  suppliers,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { ConfirmIqcReqDto } from './dto/confirm-iqc.req.dto';
import { CreateIqcReqDto } from './dto/create-iqc.req.dto';
import { GetIqcsReqDto } from './dto/get-iqcs.req.dto';
import { IqcResDto } from './dto/iqc.res.dto';
import { IqcStatsResDto } from './dto/iqc-stats.res.dto';
import { PageIqcResDto } from './dto/page-iqc.res.dto';
import { ResolveIqcReqDto } from './dto/resolve-iqc.req.dto';
import { UpdateIqcReqDto } from './dto/update-iqc.req.dto';
import { resolveAqlPlan } from './iqc-aql.constant';

@Injectable()
export class IqcService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

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
      keyword ? unaccentILike(iqcInspections.code, keyword) : undefined,
      reqDto.supplierId
        ? eq(iqcInspections.supplierId, reqDto.supplierId)
        : undefined,
      reqDto.result ? eq(iqcInspections.result, reqDto.result) : undefined,
      reqDto.disposition
        ? eq(iqcInspections.disposition, reqDto.disposition)
        : undefined,
      reqDto.status ? eq(iqcInspections.status, reqDto.status) : undefined,
      materialKeyword
        ? exists(
            this.db
              .select({ one: sql`1` })
              .from(items)
              .where(
                and(
                  eq(items.id, iqcInspections.itemId),
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
                  eq(purchaseOrders.id, iqcInspections.purchaseOrderId),
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
                  eq(inventoryReceipts.id, iqcInspections.inventoryReceiptId),
                  unaccentILike(inventoryReceipts.code, nkKeyword),
                ),
              ),
          )
        : undefined,
    );

    const [entities, countRows] = await Promise.all([
      this.db.query.iqcInspections.findMany({
        where,
        limit: reqDto.limit,
        offset: reqDto.offset,
        orderBy: desc(iqcInspections.createdAt),
        with: {
          item: { with: { unit: true } },
          supplier: true,
          inventoryReceipt: true,
          purchaseOrder: true,
          creatorBy: true,
        },
      }),
      this.db.select({ total: count() }).from(iqcInspections).where(where),
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
          sql`case when ${iqcInspections.status} = ${IqcStatus.NOT_INSPECTED} then 1 end`,
        ),
        pass: count(
          sql`case when ${iqcInspections.result} = ${IqcResult.PASS} then 1 end`,
        ),
        fail: count(
          sql`case when ${iqcInspections.result} = ${IqcResult.FAIL} then 1 end`,
        ),
        pending: count(
          sql`case when ${iqcInspections.status} = ${IqcStatus.PENDING} then 1 end`,
        ),
        waitingReturn: count(
          sql`case when ${iqcInspections.status} = ${IqcStatus.WAITING_RETURN} then 1 end`,
        ),
        completed: count(
          sql`case when ${iqcInspections.status} = ${IqcStatus.COMPLETED} then 1 end`,
        ),
      })
      .from(iqcInspections);

    return plainToInstance(IqcStatsResDto, row, {
      excludeExtraneousValues: true,
    });
  }

  async createIqc(reqDto: CreateIqcReqDto, userId: string): Promise<IqcResDto> {
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

    let code = reqDto.code;
    if (code) {
      await this.validateCodeUniqueness(code);
    } else {
      code = await this.generateIqcCode(reqDto.inspectionDate);
    }

    const [inspection] = await this.db
      .insert(iqcInspections)
      .values({ ...reqDto, code, status, createdBy: userId })
      .returning({ id: iqcInspections.id });

    return this.getIqc(inspection.id);
  }

  async getIqc(iqcId: string): Promise<IqcResDto> {
    const row = await this.db.query.iqcInspections.findFirst({
      where: eq(iqcInspections.id, iqcId),
      with: {
        item: { with: { unit: true } },
        supplier: true,
        inventoryReceipt: true,
        purchaseOrder: true,
        creatorBy: true,
        confirmerBy: true,
        resolverBy: true,
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
      { ...row, ac: plan?.ac ?? null, re: plan?.re ?? null },
      { excludeExtraneousValues: true },
    );
  }

  /** Xem `docs/domains/quality.md` — quy tắc suy `status`, dùng chung cho tạo lẫn xác nhận QC. */
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

  async confirmIqc(
    iqcId: string,
    reqDto: ConfirmIqcReqDto,
    userId: string,
  ): Promise<void> {
    const inspection = await this.ensureIqcNotInspected(iqcId);

    const plan = resolveAqlPlan(
      inspection.quantity,
      reqDto.inspectionLevel,
      reqDto.aqlLevel,
    );

    if (!plan) {
      throw new AppException(ErrorCode.E142, HttpStatus.BAD_REQUEST);
    }

    const result =
      reqDto.defectQty <= plan.ac ? IqcResult.PASS : IqcResult.FAIL;

    await this.db
      .update(iqcInspections)
      .set({
        inspectionLevel: reqDto.inspectionLevel,
        aqlLevel: reqDto.aqlLevel,
        sampleSize: reqDto.sampleSize,
        defectQty: reqDto.defectQty,
        inspectionStandard: reqDto.inspectionStandard,
        inspectorName: reqDto.inspectorName,
        measuringTools: reqDto.measuringTools,
        inspectionDate: reqDto.inspectionDate,
        result,
        status: this.resolveIqcStatus(result, undefined),
        confirmedBy: userId,
        confirmedAt: new Date(),
      })
      .where(eq(iqcInspections.id, iqcId));
  }

  private async ensureIqcNotInspected(
    iqcId: string,
  ): Promise<{ quantity: number }> {
    const inspection = await this.db.query.iqcInspections.findFirst({
      columns: { id: true, quantity: true, status: true },
      where: eq(iqcInspections.id, iqcId),
    });

    if (!inspection) {
      throw new AppException(ErrorCode.E138, HttpStatus.NOT_FOUND);
    }

    if (inspection.status !== IqcStatus.NOT_INSPECTED) {
      throw new AppException(ErrorCode.E141, HttpStatus.CONFLICT);
    }

    return inspection;
  }

  async resolveIqcDisposition(
    iqcId: string,
    reqDto: ResolveIqcReqDto,
    userId: string,
  ): Promise<void> {
    await this.ensureIqcPending(iqcId);

    await this.db
      .update(iqcInspections)
      .set({
        disposition: reqDto.disposition,
        status: this.resolveIqcStatus(IqcResult.FAIL, reqDto.disposition),
        resolvedBy: userId,
        resolvedAt: new Date(),
      })
      .where(eq(iqcInspections.id, iqcId));
  }

  private async ensureIqcPending(iqcId: string): Promise<void> {
    const inspection = await this.db.query.iqcInspections.findFirst({
      columns: { id: true, status: true },
      where: eq(iqcInspections.id, iqcId),
    });

    if (!inspection) {
      throw new AppException(ErrorCode.E138, HttpStatus.NOT_FOUND);
    }

    if (inspection.status !== IqcStatus.PENDING) {
      throw new AppException(ErrorCode.E143, HttpStatus.CONFLICT);
    }
  }

  /** Sửa lại 4 field ngữ cảnh (`inspectionStandard`/`inspectorName`/`measuringTools`/
   * `inspectionDate`) sau khi đã confirm — không đụng `inspectionLevel`/`aqlLevel`/`sampleSize`/
   * `defectQty`/`result`, những field quyết định PASS/FAIL vẫn khoá cứng sau confirm. */
  async updateIqc(iqcId: string, reqDto: UpdateIqcReqDto): Promise<void> {
    await this.ensureIqcConfirmed(iqcId);

    await this.db
      .update(iqcInspections)
      .set({
        inspectionStandard: reqDto.inspectionStandard,
        inspectorName: reqDto.inspectorName,
        measuringTools: reqDto.measuringTools,
        inspectionDate: reqDto.inspectionDate,
      })
      .where(eq(iqcInspections.id, iqcId));
  }

  private async ensureIqcConfirmed(iqcId: string): Promise<void> {
    const inspection = await this.db.query.iqcInspections.findFirst({
      columns: { id: true, status: true },
      where: eq(iqcInspections.id, iqcId),
    });

    if (!inspection) {
      throw new AppException(ErrorCode.E138, HttpStatus.NOT_FOUND);
    }

    if (inspection.status === IqcStatus.NOT_INSPECTED) {
      throw new AppException(ErrorCode.E144, HttpStatus.CONFLICT);
    }
  }

  private async generateIqcCode(inspectionDate: Date): Promise<string> {
    const year = inspectionDate.getFullYear();
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year + 1, 0, 1);
    const [totalRows] = await this.db
      .select({ total: count() })
      .from(iqcInspections)
      .where(
        and(
          gte(iqcInspections.inspectionDate, yearStart),
          lt(iqcInspections.inspectionDate, yearEnd),
        ),
      );
    return `IQC-${year}-${String((totalRows?.total ?? 0) + 1).padStart(5, '0')}`;
  }

  private async validateCodeUniqueness(code: string): Promise<void> {
    const existing = await this.db.query.iqcInspections.findFirst({
      columns: { id: true },
      where: eq(iqcInspections.code, code),
    });

    if (existing) {
      throw new AppException(ErrorCode.E140, HttpStatus.CONFLICT);
    }
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
