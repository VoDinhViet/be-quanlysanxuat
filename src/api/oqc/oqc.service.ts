import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import {
  and,
  count,
  desc,
  eq,
  exists,
  gte,
  inArray,
  lt,
  or,
  sql,
} from 'drizzle-orm';

import { OffsetPaginationDto } from '../../common/dto/offset-pagination/offset-pagination.dto';
import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { unaccentILike } from '../../common/utils/search.util';
import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import type { Database, DbTransaction } from '../../database/database.type';
import {
  IqcResult,
  items,
  oqcInspections,
  OqcStatus,
  orders,
  productionJobs,
  productionOrders,
  ProductionJobStatus,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { resolveAqlPlan } from '../iqc/iqc-aql.constant';
import { ConfirmOqcReqDto } from './dto/confirm-oqc.req.dto';
import { CreateOqcReqDto } from './dto/create-oqc.req.dto';
import { GetOqcsReqDto } from './dto/get-oqcs.req.dto';
import { OqcResDto } from './dto/oqc.res.dto';
import { PageOqcResDto } from './dto/page-oqc.res.dto';

@Injectable()
export class OqcService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async getOqcs(
    reqDto: GetOqcsReqDto,
  ): Promise<OffsetPaginatedDto<PageOqcResDto>> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;
    const materialKeyword = reqDto.materialKeyword
      ? `%${reqDto.materialKeyword}%`
      : undefined;

    const where = and(
      keyword ? unaccentILike(oqcInspections.code, keyword) : undefined,
      reqDto.productionJobId
        ? eq(oqcInspections.productionJobId, reqDto.productionJobId)
        : undefined,
      reqDto.itemId ? eq(oqcInspections.itemId, reqDto.itemId) : undefined,
      reqDto.result ? eq(oqcInspections.result, reqDto.result) : undefined,
      reqDto.status ? eq(oqcInspections.status, reqDto.status) : undefined,
      materialKeyword
        ? exists(
            this.db
              .select({ one: sql`1` })
              .from(items)
              .where(
                and(
                  eq(items.id, oqcInspections.itemId),
                  or(
                    unaccentILike(items.name, materialKeyword),
                    unaccentILike(items.code, materialKeyword),
                  ),
                ),
              ),
          )
        : undefined,
      reqDto.fromDate
        ? gte(oqcInspections.inspectionDate, reqDto.fromDate)
        : undefined,
      reqDto.toDate
        ? lt(
            oqcInspections.inspectionDate,
            new Date(reqDto.toDate.getTime() + 24 * 60 * 60 * 1000),
          )
        : undefined,
    );

    // Bước 1: lọc/phân trang trên bảng gốc, `orderCode` cưỡi cùng qua LEFT JOIN (không dùng để
    // lọc/sort — chỉ là cột hiển thị suy từ Job, relational query API không diễn đạt được).
    const [idRows, countRows] = await Promise.all([
      this.db
        .select({ id: oqcInspections.id, orderCode: orders.code })
        .from(oqcInspections)
        .leftJoin(
          productionJobs,
          eq(productionJobs.id, oqcInspections.productionJobId),
        )
        .leftJoin(
          productionOrders,
          eq(productionOrders.id, productionJobs.productionOrderId),
        )
        .leftJoin(orders, eq(orders.id, productionOrders.orderId))
        .where(where)
        .orderBy(desc(oqcInspections.createdAt))
        .limit(reqDto.limit)
        .offset(reqDto.offset),
      this.db
        .select({ total: count() })
        .from(oqcInspections)
        .leftJoin(
          productionJobs,
          eq(productionJobs.id, oqcInspections.productionJobId),
        )
        .leftJoin(
          productionOrders,
          eq(productionOrders.id, productionJobs.productionOrderId),
        )
        .leftJoin(orders, eq(orders.id, productionOrders.orderId))
        .where(where),
    ]);

    const ids = idRows.map((row) => row.id);

    // Bước 2: hydrate quan hệ — chỉ cho đúng trang hiện tại.
    const entities = ids.length
      ? await this.db.query.oqcInspections.findMany({
          where: inArray(oqcInspections.id, ids),
          with: {
            productionJob: true,
            item: { with: { unit: true } },
            creatorBy: true,
          },
        })
      : [];

    const entityById = new Map(entities.map((entity) => [entity.id, entity]));

    // Giữ đúng thứ tự đã sắp/phân trang ở bước 1 — `findMany` không đảm bảo giữ thứ tự `inArray`.
    const rows = idRows.flatMap((row) => {
      const entity = entityById.get(row.id);
      if (!entity) return [];
      return [{ ...entity, orderCode: row.orderCode }];
    });

    return new OffsetPaginatedDto(
      plainToInstance(PageOqcResDto, rows, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(countRows[0]?.total ?? 0, reqDto),
    );
  }

  async getOqc(oqcId: string): Promise<OqcResDto> {
    const row = await this.db.query.oqcInspections.findFirst({
      where: eq(oqcInspections.id, oqcId),
      with: {
        productionJob: true,
        item: { with: { unit: true } },
        creatorBy: true,
        confirmerBy: true,
      },
    });

    if (!row) {
      throw new AppException(ErrorCode.E174, HttpStatus.NOT_FOUND);
    }

    const orderCode = row.productionJobId
      ? await this.resolveOrderCode(row.productionJobId)
      : null;

    const plan =
      row.inspectionLevel && row.aqlLevel
        ? resolveAqlPlan(row.quantity, row.inspectionLevel, row.aqlLevel)
        : undefined;

    return plainToInstance(
      OqcResDto,
      {
        ...row,
        orderCode,
        ac: plan?.ac ?? null,
        re: plan?.re ?? null,
      },
      { excludeExtraneousValues: true },
    );
  }

  async createOqc(reqDto: CreateOqcReqDto, userId: string): Promise<void> {
    const job = await this.ensureJobInProgress(reqDto.productionJobId);
    await this.ensureLotSizeWithinPlanned(job, reqDto.quantity);

    let code = reqDto.code;
    if (code) {
      await this.validateCodeUniqueness(code);
    } else {
      code = await this.generateOqcCode(this.db, reqDto.inspectionDate);
    }

    await this.db.insert(oqcInspections).values({
      ...reqDto,
      code,
      itemId: job.itemId,
      createdBy: userId,
    });
  }

  async confirmOqc(
    oqcId: string,
    reqDto: ConfirmOqcReqDto,
    userId: string,
  ): Promise<void> {
    const inspection = await this.ensureOqcConfirmable(oqcId);
    const status = this.resolveOqcStatus(reqDto.result);
    const isFirstConfirm = inspection.confirmedAt === null;

    await this.db
      .update(oqcInspections)
      .set({
        ...reqDto,
        resultNote: reqDto.resultNote ?? null,
        status,
        confirmedBy: isFirstConfirm ? userId : undefined,
        confirmedAt: isFirstConfirm ? new Date() : undefined,
      })
      .where(eq(oqcInspections.id, oqcId));
  }

  async deleteOqc(oqcId: string): Promise<void> {
    const inspection = await this.db.query.oqcInspections.findFirst({
      columns: { status: true },
      where: eq(oqcInspections.id, oqcId),
    });

    if (!inspection) {
      throw new AppException(ErrorCode.E174, HttpStatus.NOT_FOUND);
    }
    if (inspection.status !== OqcStatus.NOT_INSPECTED) {
      throw new AppException(ErrorCode.E178, HttpStatus.CONFLICT);
    }

    await this.db.delete(oqcInspections).where(eq(oqcInspections.id, oqcId));
  }

  /** "PO" hiển thị trên màn OQC = `orders.code` (tên chính thức, xem
   * `ProductionJobResDto.orderCode`) — tính lúc đọc qua join, không lưu cột. Chỉ dùng cho 1 dòng
   * (`getOqc`) — list tự cưỡi cùng qua LEFT JOIN ở `getOqcs`, không lặp gọi hàm này N lần. */
  private async resolveOrderCode(
    productionJobId: string,
  ): Promise<string | null> {
    const [row] = await this.db
      .select({ orderCode: orders.code })
      .from(productionJobs)
      .innerJoin(
        productionOrders,
        eq(productionOrders.id, productionJobs.productionOrderId),
      )
      .innerJoin(orders, eq(orders.id, productionOrders.orderId))
      .where(eq(productionJobs.id, productionJobId));

    return row?.orderCode ?? null;
  }

  private resolveOqcStatus(result: IqcResult): OqcStatus {
    return result === IqcResult.PASS ? OqcStatus.COMPLETED : OqcStatus.PENDING;
  }

  private async ensureJobInProgress(productionJobId: string): Promise<{
    id: string;
    itemId: string;
    quantity: number;
  }> {
    const job = await this.db.query.productionJobs.findFirst({
      columns: { id: true, itemId: true, quantity: true, status: true },
      where: eq(productionJobs.id, productionJobId),
    });

    if (!job) {
      throw new AppException(ErrorCode.E082, HttpStatus.NOT_FOUND);
    }
    if (job.status !== ProductionJobStatus.IN_PROGRESS) {
      throw new AppException(ErrorCode.E175, HttpStatus.CONFLICT);
    }

    return job;
  }

  /** Tổng lot size mọi OQC hiện có (bảng hard-delete nên dòng đã xoá không còn để tính) của cùng
   * Job, cộng lô mới, không được vượt SL kế hoạch (`production_jobs.quantity`) — cho phép kiểm
   * nhiều lần từng phần (partial). */
  private async ensureLotSizeWithinPlanned(
    job: { id: string; quantity: number },
    newQuantity: number,
  ): Promise<void> {
    const [row] = await this.db
      .select({
        total:
          sql<number>`coalesce(sum(${oqcInspections.quantity}), 0)`.mapWith(
            Number,
          ),
      })
      .from(oqcInspections)
      .where(eq(oqcInspections.productionJobId, job.id));

    if ((row?.total ?? 0) + newQuantity > job.quantity) {
      throw new AppException(ErrorCode.E176, HttpStatus.BAD_REQUEST);
    }
  }

  private async ensureOqcConfirmable(
    oqcId: string,
  ): Promise<{ confirmedAt: Date | null }> {
    const inspection = await this.db.query.oqcInspections.findFirst({
      columns: { confirmedAt: true, status: true },
      where: eq(oqcInspections.id, oqcId),
    });

    if (!inspection) {
      throw new AppException(ErrorCode.E174, HttpStatus.NOT_FOUND);
    }
    if (inspection.status === OqcStatus.COMPLETED) {
      throw new AppException(ErrorCode.E177, HttpStatus.CONFLICT);
    }

    return inspection;
  }

  private async validateCodeUniqueness(code: string): Promise<void> {
    const existing = await this.db.query.oqcInspections.findFirst({
      columns: { id: true },
      where: eq(oqcInspections.code, code),
    });

    if (existing) {
      throw new AppException(ErrorCode.E181, HttpStatus.CONFLICT);
    }
  }

  private async generateOqcCode(
    db: Database | DbTransaction,
    inspectionDate: Date,
  ): Promise<string> {
    const year = inspectionDate.getFullYear();
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year + 1, 0, 1);
    const [totalRows] = await db
      .select({ total: count() })
      .from(oqcInspections)
      .where(
        and(
          gte(oqcInspections.inspectionDate, yearStart),
          lt(oqcInspections.inspectionDate, yearEnd),
        ),
      );
    return `OQC-${year}-${String((totalRows?.total ?? 0) + 1).padStart(5, '0')}`;
  }
}
