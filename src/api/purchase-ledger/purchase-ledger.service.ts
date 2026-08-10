import { Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import {
  and,
  asc,
  count,
  eq,
  getTableColumns,
  gte,
  lt,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';

import { OffsetPaginationDto } from '../../common/dto/offset-pagination/offset-pagination.dto';
import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { unaccentILike } from '../../common/utils/search.util';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import {
  items,
  productionOrders,
  purchaseRequestItems,
  purchaseRequests,
  PurchaseRequestStatus,
  units,
} from '../../database/schemas';
import { GetPurchaseLedgerReqDto } from './dto/get-purchase-ledger.req.dto';
import { PurchaseLedgerItemResDto } from './dto/purchase-ledger-item.res.dto';
import { PurchaseLedgerStatus } from './purchase-ledger.constant';
import {
  orderedQuantitySubquery,
  quotedQuantitySubquery,
  receivedQuantitySubquery,
} from './purchase-ledger.query';

type LedgerQuantityRefs = {
  orderedQuantity: SQL<number>;
  receivedQuantity: SQL<number>;
  quotedQuantity: SQL<number>;
};

/** Chưa có module `purchase-quotations`/`purchase-orders` — `quotedQuantity`/`orderedQuantity` đọc
 * thẳng bảng đã có ở schema nhưng chưa route nào ghi, luôn `0` tới khi hai module đó lên
 * (`docs/domains/purchasing.md`). */
@Injectable()
export class PurchaseLedgerService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async getPurchaseLedgers(
    reqDto: GetPurchaseLedgerReqDto,
  ): Promise<OffsetPaginatedDto<PurchaseLedgerItemResDto>> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;
    const materialKeyword = reqDto.materialKeyword
      ? `%${reqDto.materialKeyword}%`
      : undefined;

    const orderedAgg = orderedQuantitySubquery(this.db);
    const receivedAgg = receivedQuantitySubquery(this.db);
    const quotedAgg = quotedQuantitySubquery(this.db);
    const refs = this.buildQuantityRefs(orderedAgg, receivedAgg, quotedAgg);

    const where = and(
      eq(purchaseRequests.status, PurchaseRequestStatus.APPROVED),
      keyword ? unaccentILike(purchaseRequests.code, keyword) : undefined,
      materialKeyword
        ? or(
            unaccentILike(items.name, materialKeyword),
            unaccentILike(items.code, materialKeyword),
          )
        : undefined,
      reqDto.purchaseRequestId
        ? eq(purchaseRequests.id, reqDto.purchaseRequestId)
        : undefined,
      reqDto.itemId ? eq(items.id, reqDto.itemId) : undefined,
      reqDto.productionOrderId
        ? eq(purchaseRequests.productionOrderId, reqDto.productionOrderId)
        : undefined,
      reqDto.status
        ? this.buildStatusCondition(refs, reqDto.status)
        : undefined,
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

    const [rows, countRows] = await Promise.all([
      this.db
        .select({
          id: purchaseRequestItems.id,
          quantity: purchaseRequestItems.quantity,
          note: purchaseRequestItems.note,
          item: getTableColumns(items),
          unit: getTableColumns(units),
          purchaseRequest: getTableColumns(purchaseRequests),
          productionOrder: getTableColumns(productionOrders),
          neededDate: purchaseRequests.neededDate,
          createdAt: purchaseRequests.createdAt,
          orderedQuantity: refs.orderedQuantity,
          quotedQuantity: refs.quotedQuantity,
          status: this.buildLedgerStatus(refs),
        })
        .from(purchaseRequestItems)
        .innerJoin(
          purchaseRequests,
          eq(purchaseRequests.id, purchaseRequestItems.purchaseRequestId),
        )
        .innerJoin(items, eq(items.id, purchaseRequestItems.itemId))
        .innerJoin(units, eq(units.id, items.unitId))
        .leftJoin(
          productionOrders,
          eq(productionOrders.id, purchaseRequests.productionOrderId),
        )
        .leftJoin(
          orderedAgg,
          eq(orderedAgg.purchaseRequestItemId, purchaseRequestItems.id),
        )
        .leftJoin(
          receivedAgg,
          eq(receivedAgg.purchaseRequestItemId, purchaseRequestItems.id),
        )
        .leftJoin(
          quotedAgg,
          eq(quotedAgg.purchaseRequestItemId, purchaseRequestItems.id),
        )
        .where(where)
        .orderBy(asc(items.code))
        .limit(reqDto.limit)
        .offset(reqDto.offset),
      this.db
        .select({ total: count() })
        .from(purchaseRequestItems)
        .innerJoin(
          purchaseRequests,
          eq(purchaseRequests.id, purchaseRequestItems.purchaseRequestId),
        )
        .innerJoin(items, eq(items.id, purchaseRequestItems.itemId))
        .leftJoin(
          orderedAgg,
          eq(orderedAgg.purchaseRequestItemId, purchaseRequestItems.id),
        )
        .leftJoin(
          receivedAgg,
          eq(receivedAgg.purchaseRequestItemId, purchaseRequestItems.id),
        )
        .leftJoin(
          quotedAgg,
          eq(quotedAgg.purchaseRequestItemId, purchaseRequestItems.id),
        )
        .where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(PurchaseLedgerItemResDto, rows, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(countRows[0]?.total ?? 0, reqDto),
    );
  }

  /** Điều kiện lọc `WHERE` khớp đúng một giá trị `PurchaseLedgerStatus` — mỗi nhánh vừa loại trừ,
   * vừa gộp đủ (`orderedQuantity > 0` chia COMPLETED/ORDERED; `= 0` chia QUOTING/WAITING), cùng
   * thứ tự ưu tiên với CASE tính `status` ở `getPurchaseLedgers`. */
  private buildStatusCondition(
    refs: LedgerQuantityRefs,
    status: PurchaseLedgerStatus,
  ): SQL {
    switch (status) {
      case PurchaseLedgerStatus.COMPLETED:
        return sql`(${refs.orderedQuantity} > 0 and ${refs.receivedQuantity} >= ${refs.orderedQuantity})`;
      case PurchaseLedgerStatus.ORDERED:
        return sql`(${refs.orderedQuantity} > 0 and ${refs.receivedQuantity} < ${refs.orderedQuantity})`;
      case PurchaseLedgerStatus.QUOTING:
        return sql`(${refs.orderedQuantity} = 0 and ${refs.quotedQuantity} > 0)`;
      case PurchaseLedgerStatus.WAITING_TO_PURCHASE:
        return sql`(${refs.orderedQuantity} = 0 and ${refs.quotedQuantity} = 0)`;
    }
  }

  /** Coalesce ba subquery aggregate về 0 — LEFT JOIN không khớp dòng nào thì các cột này null. */
  private buildQuantityRefs(
    orderedAgg: ReturnType<typeof orderedQuantitySubquery>,
    receivedAgg: ReturnType<typeof receivedQuantitySubquery>,
    quotedAgg: ReturnType<typeof quotedQuantitySubquery>,
  ): LedgerQuantityRefs {
    return {
      orderedQuantity:
        sql<number>`coalesce(${orderedAgg.orderedQuantity}, 0)`.mapWith(Number),
      receivedQuantity:
        sql<number>`coalesce(${receivedAgg.receivedQuantity}, 0)`.mapWith(
          Number,
        ),
      quotedQuantity:
        sql<number>`coalesce(${quotedAgg.quotedQuantity}, 0)`.mapWith(Number),
    };
  }

  /** Cùng thứ tự ưu tiên với `buildStatusCondition`, viết dạng CASE để trả trực tiếp giá trị hiển
   * thị — không cần map lại trong JS sau khi đọc. */
  private buildLedgerStatus(
    refs: LedgerQuantityRefs,
  ): SQL<PurchaseLedgerStatus> {
    return sql<PurchaseLedgerStatus>`
      case
        when ${refs.orderedQuantity} > 0
          and ${refs.receivedQuantity} >= ${refs.orderedQuantity}
          then ${PurchaseLedgerStatus.COMPLETED}

        when ${refs.orderedQuantity} > 0
          then ${PurchaseLedgerStatus.ORDERED}

        when ${refs.quotedQuantity} > 0
          then ${PurchaseLedgerStatus.QUOTING}

        else ${PurchaseLedgerStatus.WAITING_TO_PURCHASE}
      end
    `.mapWith((value): PurchaseLedgerStatus => value);
  }
}
