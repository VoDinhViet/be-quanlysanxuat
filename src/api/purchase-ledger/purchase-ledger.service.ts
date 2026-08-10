import { Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import {
  and,
  asc,
  count,
  eq,
  exists,
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
  files,
  items,
  productionOrders,
  purchaseOrderItems,
  purchaseOrders,
  purchaseQuotationItems,
  purchaseQuotations,
  purchaseRequestItems,
  purchaseRequests,
  PurchaseRequestStatus,
  units,
} from '../../database/schemas';
import {
  itemOnHandSubquery,
  itemStockColumnsByScope,
  jobMaterialDemandByJobSubquery,
  jobMaterialDemandByOrderSubquery,
} from '../inventory/item-stock.query';
import { GetPurchaseLedgerReqDto } from './dto/get-purchase-ledger.req.dto';
import { PurchaseLedgerItemResDto } from './dto/purchase-ledger-item.res.dto';
import { PurchaseLedgerStatus } from './purchase-ledger.constant';
import {
  purchaseOrderAggregateSubquery,
  quotationAggregateSubquery,
  receivedQuantityAggregateSubquery,
} from './purchase-ledger.query';

type LedgerStatusRefs = {
  cancelledAt: SQL | null;
  orderedQuantity: SQL<number>;
  totalOrderItems: SQL<number>;
  receivedQuantity: SQL<number>;
  hasQuoted: SQL<boolean>;
  selectedAt: SQL<Date | null> | null;
};

@Injectable()
export class PurchaseLedgerService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async getPurchaseLedger(
    reqDto: GetPurchaseLedgerReqDto,
  ): Promise<OffsetPaginatedDto<PurchaseLedgerItemResDto>> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;
    const materialKeyword = reqDto.materialKeyword
      ? `%${reqDto.materialKeyword}%`
      : undefined;

    const balance = itemOnHandSubquery(this.db);
    const jobDemand = jobMaterialDemandByJobSubquery(this.db);
    const orderDemand = jobMaterialDemandByOrderSubquery(this.db);
    const orderAgg = purchaseOrderAggregateSubquery(this.db);
    const receivedAgg = receivedQuantityAggregateSubquery(this.db);
    const quotationAgg = quotationAggregateSubquery(this.db);

    const refs: LedgerStatusRefs = {
      cancelledAt: sql`${purchaseRequestItems.cancelledAt}`,
      orderedQuantity:
        sql<number>`coalesce(${orderAgg.orderedQuantity}, 0)`.mapWith(Number),
      totalOrderItems:
        sql<number>`coalesce(${orderAgg.totalOrderItems}, 0)`.mapWith(Number),
      receivedQuantity:
        sql<number>`coalesce(${receivedAgg.receivedQuantity}, 0)`.mapWith(
          Number,
        ),
      hasQuoted:
        sql<boolean>`coalesce(${quotationAgg.hasQuoted}, false)`.mapWith(
          Boolean,
        ),
      selectedAt: sql`${quotationAgg.selectedAt}`,
    };

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
      reqDto.supplierId ? this.supplierCondition(reqDto.supplierId) : undefined,
      reqDto.status
        ? this.purchaseLedgerStatusCondition(refs, reqDto.status)
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
          cancelledAt: purchaseRequestItems.cancelledAt,
          item: getTableColumns(items),
          unit: getTableColumns(units),
          imageFile: getTableColumns(files),
          purchaseRequest: getTableColumns(purchaseRequests),
          productionOrder: getTableColumns(productionOrders),
          orderedQuantity: refs.orderedQuantity,
          receivedQuantity: refs.receivedQuantity,
          totalOrderItems: refs.totalOrderItems,
          hasQuoted: refs.hasQuoted,
          selectedAt: quotationAgg.selectedAt,
          ...itemStockColumnsByScope(balance, jobDemand, orderDemand),
        })
        .from(purchaseRequestItems)
        .innerJoin(
          purchaseRequests,
          eq(purchaseRequests.id, purchaseRequestItems.purchaseRequestId),
        )
        .innerJoin(items, eq(items.id, purchaseRequestItems.itemId))
        .innerJoin(units, eq(units.id, items.unitId))
        .leftJoin(files, eq(files.id, items.imageFileId))
        .leftJoin(
          productionOrders,
          eq(productionOrders.id, purchaseRequests.productionOrderId),
        )
        .leftJoin(balance, eq(balance.itemId, items.id))
        .leftJoin(
          jobDemand,
          and(
            eq(jobDemand.productionJobId, purchaseRequests.productionJobId),
            eq(jobDemand.itemId, items.id),
          ),
        )
        .leftJoin(
          orderDemand,
          and(
            eq(
              orderDemand.productionOrderId,
              purchaseRequests.productionOrderId,
            ),
            eq(orderDemand.itemId, items.id),
          ),
        )
        .leftJoin(
          orderAgg,
          eq(orderAgg.purchaseRequestItemId, purchaseRequestItems.id),
        )
        .leftJoin(
          receivedAgg,
          eq(receivedAgg.purchaseRequestItemId, purchaseRequestItems.id),
        )
        .leftJoin(
          quotationAgg,
          eq(quotationAgg.purchaseRequestItemId, purchaseRequestItems.id),
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
          orderAgg,
          eq(orderAgg.purchaseRequestItemId, purchaseRequestItems.id),
        )
        .leftJoin(
          receivedAgg,
          eq(receivedAgg.purchaseRequestItemId, purchaseRequestItems.id),
        )
        .leftJoin(
          quotationAgg,
          eq(quotationAgg.purchaseRequestItemId, purchaseRequestItems.id),
        )
        .where(where),
    ]);

    const entities = rows.map(
      ({
        item,
        unit,
        imageFile,
        purchaseRequest,
        cancelledAt,
        orderedQuantity,
        receivedQuantity,
        totalOrderItems,
        hasQuoted,
        selectedAt,
        ...rest
      }) => {
        const status = this.computeStatus({
          cancelledAt,
          orderedQuantity,
          receivedQuantity,
          totalOrderItems,
          hasQuoted,
          selectedAt,
        });

        return {
          ...rest,
          item: { ...item, unit, imageFile },
          purchaseRequest,
          neededDate: purchaseRequest.neededDate,
          createdAt: purchaseRequest.createdAt,
          orderedQuantity,
          receivedQuantity,
          remainingQuantity: orderedQuantity - receivedQuantity,
          status,
          pendingPurchaseSince:
            status === PurchaseLedgerStatus.PENDING_PURCHASE
              ? selectedAt
              : null,
        };
      },
    );

    return new OffsetPaginatedDto(
      plainToInstance(PurchaseLedgerItemResDto, entities, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(countRows[0]?.total ?? 0, reqDto),
    );
  }

  /** Khớp NCC đã báo giá **hoặc** đã được đặt mua cho dòng này — hai đường độc lập vì đơn mua
   * không bắt buộc qua báo giá (`docs/domains/purchasing.md`). */
  private supplierCondition(supplierId: string): SQL {
    return or(
      exists(
        this.db
          .select({ one: sql`1` })
          .from(purchaseQuotationItems)
          .innerJoin(
            purchaseQuotations,
            eq(purchaseQuotations.id, purchaseQuotationItems.quotationId),
          )
          .where(
            and(
              eq(
                purchaseQuotationItems.purchaseRequestItemId,
                purchaseRequestItems.id,
              ),
              eq(purchaseQuotations.supplierId, supplierId),
            ),
          ),
      ),
      exists(
        this.db
          .select({ one: sql`1` })
          .from(purchaseOrderItems)
          .innerJoin(
            purchaseOrders,
            eq(purchaseOrders.id, purchaseOrderItems.purchaseOrderId),
          )
          .where(
            and(
              eq(
                purchaseOrderItems.purchaseRequestItemId,
                purchaseRequestItems.id,
              ),
              eq(purchaseOrders.supplierId, supplierId),
            ),
          ),
      ),
    ) as SQL;
  }

  /** Điều kiện lọc `WHERE` khớp đúng một giá trị `PurchaseLedgerStatus` — mỗi nhánh loại trừ
   * tường minh các nhánh đứng trước theo đúng thứ tự ưu tiên ở `computeStatus`/
   * `docs/domains/purchasing.md`, không dựa vào suy luận số học ngầm. */
  private purchaseLedgerStatusCondition(
    refs: LedgerStatusRefs,
    status: PurchaseLedgerStatus,
  ): SQL {
    const cancelled = sql`((${refs.cancelledAt}) is not null or (${refs.totalOrderItems} > 0 and ${refs.orderedQuantity} = 0))`;

    switch (status) {
      case PurchaseLedgerStatus.CANCELLED:
        return sql`(${cancelled})`;
      case PurchaseLedgerStatus.COMPLETED:
        return sql`(not ${cancelled} and ${refs.orderedQuantity} > 0 and ${refs.receivedQuantity} >= ${refs.orderedQuantity})`;
      case PurchaseLedgerStatus.RECEIVING:
        return sql`(not ${cancelled} and ${refs.receivedQuantity} > 0 and ${refs.receivedQuantity} < ${refs.orderedQuantity})`;
      case PurchaseLedgerStatus.PURCHASED:
        return sql`(not ${cancelled} and ${refs.orderedQuantity} > 0 and ${refs.receivedQuantity} = 0)`;
      case PurchaseLedgerStatus.PENDING_PURCHASE:
        return sql`(not ${cancelled} and ${refs.orderedQuantity} = 0 and (${refs.selectedAt}) is not null)`;
      case PurchaseLedgerStatus.QUOTED:
        return sql`(not ${cancelled} and ${refs.orderedQuantity} = 0 and (${refs.selectedAt}) is null and ${refs.hasQuoted})`;
      case PurchaseLedgerStatus.NOT_QUOTED:
        return sql`(not ${cancelled} and ${refs.orderedQuantity} = 0 and (${refs.selectedAt}) is null and not ${refs.hasQuoted})`;
    }
  }

  /** Tính trong JS sau khi đọc số — cùng thứ tự ưu tiên với `purchaseLedgerStatusCondition`,
   * dùng cho giá trị hiển thị (`docs/domains/purchasing.md`). */
  private computeStatus(row: {
    cancelledAt: Date | null;
    orderedQuantity: number;
    totalOrderItems: number;
    receivedQuantity: number;
    hasQuoted: boolean;
    selectedAt: Date | null;
  }): PurchaseLedgerStatus {
    if (
      row.cancelledAt ||
      (row.totalOrderItems > 0 && row.orderedQuantity === 0)
    ) {
      return PurchaseLedgerStatus.CANCELLED;
    }
    if (
      row.orderedQuantity > 0 &&
      row.receivedQuantity >= row.orderedQuantity
    ) {
      return PurchaseLedgerStatus.COMPLETED;
    }
    if (
      row.receivedQuantity > 0 &&
      row.receivedQuantity < row.orderedQuantity
    ) {
      return PurchaseLedgerStatus.RECEIVING;
    }
    if (row.orderedQuantity > 0) {
      return PurchaseLedgerStatus.PURCHASED;
    }
    if (row.selectedAt) {
      return PurchaseLedgerStatus.PENDING_PURCHASE;
    }
    if (row.hasQuoted) {
      return PurchaseLedgerStatus.QUOTED;
    }
    return PurchaseLedgerStatus.NOT_QUOTED;
  }
}
