import { Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { and, count, desc, eq, exists, gte, lt, or, sql } from 'drizzle-orm';

import { OffsetPaginationDto } from '../../common/dto/offset-pagination/offset-pagination.dto';
import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { unaccentILike } from '../../common/utils/search.util';
import { DRIZZLE } from '../../database/database.module';
import type { Database, DbTransaction } from '../../database/database.type';
import {
  items,
  purchaseRequestItems,
  purchaseRequests,
} from '../../database/schemas';
import { GetPurchaseRequestsReqDto } from './dto/get-purchase-requests.req.dto';
import { PurchaseRequestResDto } from './dto/purchase-request.res.dto';
import { CreateShortageRequestInput } from './types/shortage-request.type';

@Injectable()
export class PurchaseRequestsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async getPurchaseRequests(
    reqDto: GetPurchaseRequestsReqDto,
  ): Promise<OffsetPaginatedDto<PurchaseRequestResDto>> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;
    const materialKeyword = reqDto.materialKeyword
      ? `%${reqDto.materialKeyword}%`
      : undefined;

    const where = and(
      keyword ? unaccentILike(purchaseRequests.code, keyword) : undefined,
      materialKeyword
        ? exists(
            this.db
              .select({ one: sql`1` })
              .from(purchaseRequestItems)
              .innerJoin(items, eq(items.id, purchaseRequestItems.itemId))
              .where(
                and(
                  eq(
                    purchaseRequestItems.purchaseRequestId,
                    purchaseRequests.id,
                  ),
                  or(
                    unaccentILike(items.name, materialKeyword),
                    unaccentILike(items.code, materialKeyword),
                  ),
                ),
              ),
          )
        : undefined,
      reqDto.productionOrderId
        ? eq(purchaseRequests.productionOrderId, reqDto.productionOrderId)
        : undefined,
      reqDto.productionJobId
        ? eq(purchaseRequests.productionJobId, reqDto.productionJobId)
        : undefined,
      reqDto.requesterId
        ? eq(purchaseRequests.createdBy, reqDto.requesterId)
        : undefined,
      reqDto.departmentId
        ? eq(purchaseRequests.departmentId, reqDto.departmentId)
        : undefined,
      reqDto.status ? eq(purchaseRequests.status, reqDto.status) : undefined,
      reqDto.neededDate
        ? eq(purchaseRequests.neededDate, reqDto.neededDate)
        : undefined,
      reqDto.fromDate
        ? gte(purchaseRequests.createdAt, reqDto.fromDate)
        : undefined,
      reqDto.toDate
        ? lt(
            purchaseRequests.createdAt,
            new Date(reqDto.toDate.getTime() + 24 * 60 * 60 * 1000),
          )
        : undefined,
    );

    const [entities, countRows] = await Promise.all([
      this.db.query.purchaseRequests.findMany({
        where,
        limit: reqDto.limit,
        offset: reqDto.offset,
        orderBy: desc(purchaseRequests.createdAt),
        with: {
          department: true,
          requester: true,
          productionOrder: true,
          productionJob: true,
        },
      }),
      this.db.select({ total: count() }).from(purchaseRequests).where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(PurchaseRequestResDto, entities, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(countRows[0]?.total ?? 0, reqDto),
    );
  }

  /** Ghi header + dòng vật tư của một đề xuất trong transaction của nơi gọi — đường ghi duy nhất
   * vào `purchase_requests`/`purchase_request_items`, gọi từ `ProductionJobsService.startJob` khi
   * Job thiếu vật tư. `status` để mặc định `DRAFT` — chưa có route duyệt
   * (`docs/domains/purchase-requests.md`). */
  async createShortageRequest(
    tx: DbTransaction,
    input: CreateShortageRequestInput,
  ): Promise<void> {
    const { items, ...header } = input;
    const code = await this.generatePurchaseRequestCode(tx);

    const [purchaseRequest] = await tx
      .insert(purchaseRequests)
      .values({ ...header, code, neededDate: new Date() })
      .returning({ id: purchaseRequests.id });

    await tx.insert(purchaseRequestItems).values(
      items.map((item) => ({
        ...item,
        purchaseRequestId: purchaseRequest.id,
      })),
    );
  }

  /** Khuôn `InventoryReceiptsService.generateReceiptCode` — `COUNT(*) + 1` pad 4 chữ số, không
   * tách theo năm; unique constraint trên `code` là chốt chặn thật, cùng giới hạn TOCTOU đã chấp
   * nhận chung trong repo. */
  private async generatePurchaseRequestCode(
    tx: DbTransaction,
  ): Promise<string> {
    const [totalRows] = await tx
      .select({ total: count() })
      .from(purchaseRequests);
    return `DXMH${String((totalRows?.total ?? 0) + 1).padStart(4, '0')}`;
  }
}
