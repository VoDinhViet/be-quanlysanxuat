import { Inject, Injectable, StreamableFile } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  gte,
  isNull,
  lt,
  lte,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { DateTime } from 'luxon';

import { OffsetPaginationDto } from '../../common/dto/offset-pagination/offset-pagination.dto';
import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { buildXlsxBuffer, XLSX_MIME } from '../../common/utils/excel.util';
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
import { ExportPurchaseLedgerReqDto } from './dto/export-purchase-ledger.req.dto';
import { GetPurchaseLedgerReqDto } from './dto/get-purchase-ledger.req.dto';
import { PurchaseLedgerItemResDto } from './dto/purchase-ledger-item.res.dto';
import { PurchaseLedgerStatus } from './purchase-ledger.constant';
import { PURCHASE_LEDGER_EXPORT_COLUMNS } from './purchase-ledger.export';
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

/** `quotedQuantity` đọc từ `purchase-quotations`, `orderedQuantity` từ `purchase-orders` — cả hai
 * module đã có route ghi, nhưng `orderedQuantity` chỉ đếm PO `ORDERED` (PO `DRAFT` tự sinh từ duyệt
 * RFQ không tính) nên phần lớn dòng vẫn dừng ở `WAITING_TO_PURCHASE`/`QUOTING` cho tới khi PO được
 * `confirm` (`docs/domains/purchasing.md`). */
@Injectable()
export class PurchaseLedgerService {
  private static readonly MAX_EXPORT_ROWS = 10_000;

  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async getPurchaseLedgers(
    reqDto: GetPurchaseLedgerReqDto,
  ): Promise<OffsetPaginatedDto<PurchaseLedgerItemResDto>> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;

    const orderedAgg = orderedQuantitySubquery(this.db);
    const receivedAgg = receivedQuantitySubquery(this.db);
    const quotedAgg = quotedQuantitySubquery(this.db);
    const refs = this.buildQuantityRefs(orderedAgg, receivedAgg, quotedAgg);

    const where = and(
      eq(purchaseRequests.status, PurchaseRequestStatus.APPROVED),
      isNull(purchaseRequestItems.cancelledAt),
      keyword
        ? or(
            unaccentILike(purchaseRequests.code, keyword),
            unaccentILike(items.code, keyword),
            unaccentILike(items.name, keyword),
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
      reqDto.hasRemainingQuotation
        ? sql`${refs.quotedQuantity} < ${purchaseRequestItems.quantity}`
        : undefined,
      reqDto.neededStartDate
        ? gte(purchaseRequests.neededDate, reqDto.neededStartDate)
        : undefined,
      reqDto.neededEndDate
        ? lte(purchaseRequests.neededDate, reqDto.neededEndDate)
        : undefined,
      reqDto.createdStartDate
        ? gte(purchaseRequests.createdAt, reqDto.createdStartDate)
        : undefined,
      reqDto.createdEndDate
        ? lt(
            purchaseRequests.createdAt,
            new Date(reqDto.createdEndDate.getTime() + 24 * 60 * 60 * 1000),
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

  /** Cắt im lặng ở `MAX_EXPORT_ROWS`, không báo lỗi khi vượt trần. Bộ lọc tách riêng khỏi
   * `getPurchaseLedgers` dù trông giống nhau — hai route độc lập, sửa filter route nào chỉ route
   * đó đổi. */
  async exportPurchaseLedgers(
    reqDto: ExportPurchaseLedgerReqDto,
  ): Promise<StreamableFile> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;

    const orderedAgg = orderedQuantitySubquery(this.db);
    const receivedAgg = receivedQuantitySubquery(this.db);
    const quotedAgg = quotedQuantitySubquery(this.db);
    const refs = this.buildQuantityRefs(orderedAgg, receivedAgg, quotedAgg);

    const where = and(
      eq(purchaseRequests.status, PurchaseRequestStatus.APPROVED),
      isNull(purchaseRequestItems.cancelledAt),
      keyword
        ? or(
            unaccentILike(purchaseRequests.code, keyword),
            unaccentILike(items.code, keyword),
            unaccentILike(items.name, keyword),
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
      reqDto.neededStartDate
        ? gte(purchaseRequests.neededDate, reqDto.neededStartDate)
        : undefined,
      reqDto.neededEndDate
        ? lte(purchaseRequests.neededDate, reqDto.neededEndDate)
        : undefined,
      reqDto.createdStartDate
        ? gte(purchaseRequests.createdAt, reqDto.createdStartDate)
        : undefined,
      reqDto.createdEndDate
        ? lt(
            purchaseRequests.createdAt,
            new Date(reqDto.createdEndDate.getTime() + 24 * 60 * 60 * 1000),
          )
        : undefined,
    );

    const rows = await this.db
      .select({
        requestCode: purchaseRequests.code,
        itemCode: items.code,
        itemName: items.name,
        unitName: units.name,
        productionOrderCode: productionOrders.code,
        quantity: purchaseRequestItems.quantity,
        quotedQuantity: refs.quotedQuantity,
        orderedQuantity: refs.orderedQuantity,
        status: this.buildLedgerStatus(refs),
        neededDate: purchaseRequests.neededDate,
        note: purchaseRequestItems.note,
        createdAt: purchaseRequests.createdAt,
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
      .orderBy(desc(purchaseRequests.createdAt))
      .limit(PurchaseLedgerService.MAX_EXPORT_ROWS);

    const buffer = await buildXlsxBuffer(
      'Sổ cái mua hàng',
      PURCHASE_LEDGER_EXPORT_COLUMNS,
      rows,
    );
    const fileName = `so-cai-mua-hang-${DateTime.now().toFormat('yyyyLLdd-HHmm')}.xlsx`;
    return new StreamableFile(buffer, {
      type: XLSX_MIME,
      disposition: `attachment; filename="${fileName}"`,
    });
  }

  /** Điều kiện lọc `WHERE` khớp đúng một giá trị `PurchaseLedgerStatus` — mỗi nhánh vừa loại trừ,
   * vừa gộp đủ, cùng thứ tự ưu tiên với CASE tính `status` ở `getPurchaseLedgers`. COMPLETED đòi đặt
   * đủ SL đề xuất (`orderedQuantity >= quantity`) rồi mới xét nhận đủ — đặt thiếu rồi nhận hết phần
   * đã đặt vẫn là ORDERED, không phải COMPLETED. */
  private buildStatusCondition(
    refs: LedgerQuantityRefs,
    status: PurchaseLedgerStatus,
  ): SQL {
    switch (status) {
      case PurchaseLedgerStatus.COMPLETED:
        return sql`(${refs.orderedQuantity} >= ${purchaseRequestItems.quantity} and ${refs.receivedQuantity} >= ${refs.orderedQuantity})`;
      case PurchaseLedgerStatus.ORDERED:
        return sql`(${refs.orderedQuantity} > 0 and (${refs.orderedQuantity} < ${purchaseRequestItems.quantity} or ${refs.receivedQuantity} < ${refs.orderedQuantity}))`;
      case PurchaseLedgerStatus.QUOTING:
        return sql`(${refs.orderedQuantity} = 0 and ${refs.quotedQuantity} > 0)`;
      case PurchaseLedgerStatus.WAITING_TO_PURCHASE:
        return sql`(${refs.orderedQuantity} = 0 and ${refs.quotedQuantity} < ${purchaseRequestItems.quantity})`;
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
        when ${refs.orderedQuantity} >= ${purchaseRequestItems.quantity}
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
