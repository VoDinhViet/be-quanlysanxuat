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
import { CreateIqcReqDto } from './dto/create-iqc.req.dto';
import { GetIqcsReqDto } from './dto/get-iqcs.req.dto';
import { IqcResDto } from './dto/iqc.res.dto';
import { IqcStatsResDto } from './dto/iqc-stats.res.dto';
import { PageIqcResDto } from './dto/page-iqc.res.dto';

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

    if (reqDto.result === IqcResult.PASS && reqDto.disposition) {
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

  private async getIqc(iqcId: string): Promise<IqcResDto> {
    const row = await this.db.query.iqcInspections.findFirst({
      where: eq(iqcInspections.id, iqcId),
      with: {
        item: { with: { unit: true } },
        supplier: true,
        inventoryReceipt: true,
        purchaseOrder: true,
        creatorBy: true,
      },
    });

    if (!row) {
      throw new AppException(ErrorCode.E138, HttpStatus.NOT_FOUND);
    }

    return plainToInstance(IqcResDto, row, { excludeExtraneousValues: true });
  }

  /** Xem `docs/domains/quality.md` — quy tắc suy `status` từ `result`/`disposition` lúc tạo. */
  private resolveIqcStatus(
    result: IqcResult,
    disposition: IqcDisposition | undefined,
  ): IqcStatus {
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
