import { Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { and, asc, count, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm';

import { OffsetPaginationDto } from '../../common/dto/offset-pagination/offset-pagination.dto';
import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { unaccentILike } from '../../common/utils/search.util';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import {
  orderItems,
  orders,
  OrderItemStatus,
  OrderStatus,
  products,
  ProductStatus,
  ProductType,
  stockReceiptItems,
  stockReceipts,
  StockReceiptType,
} from '../../database/schemas';
import { GetInventoryReqDto } from './dto/get-inventory.req.dto';
import { InventoryItemResDto } from './dto/inventory-item.res.dto';

/**
 * Read-only stock levels for finished goods. Nothing here is stored: every number is computed at
 * read time from `stock_receipt_items` (the ledger `StockReceiptsService` writes to) and
 * `order_items`, so it can never drift from the data that produced it — see the doc comment on
 * `stock_receipts` in `src/database/schemas/stock-receipts.ts`.
 */
@Injectable()
export class InventoryService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * Lists every ACTIVE finished good — including ones that have never had a single receipt — not
   * just products that happen to have stock movement. Pagination/filtering runs against `products`
   * directly; `onHand`/`reserved` are then looked up only for the current page's ids.
   */
  async getInventory(
    reqDto: GetInventoryReqDto,
  ): Promise<OffsetPaginatedDto<InventoryItemResDto>> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;
    const where = and(
      eq(products.type, ProductType.FINISHED_GOOD),
      eq(products.status, ProductStatus.ACTIVE),
      isNull(products.deletedAt),
      keyword
        ? or(
            unaccentILike(products.code, keyword),
            unaccentILike(products.name, keyword),
          )
        : undefined,
      reqDto.productGroupId
        ? eq(products.productGroupId, reqDto.productGroupId)
        : undefined,
    );

    const [entities, countRows] = await Promise.all([
      this.db.query.products.findMany({
        where,
        limit: reqDto.limit,
        offset: reqDto.offset,
        orderBy: asc(products.code),
        with: { group: true, unit: true, imageFile: true },
      }),
      this.db.select({ total: count() }).from(products).where(where),
    ]);

    const stockByProduct = await this.getStockLevels(
      entities.map((product) => product.id),
    );

    const items = entities.map((product) => {
      const stock = stockByProduct.get(product.id) ?? {
        onHand: 0,
        reserved: 0,
      };
      return {
        ...product,
        onHand: stock.onHand,
        reserved: stock.reserved,
        available: stock.onHand - stock.reserved,
      };
    });

    return new OffsetPaginatedDto(
      plainToInstance(InventoryItemResDto, items, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(countRows[0]?.total ?? 0, reqDto),
    );
  }

  /**
   * Rules:
   * - `onHand(product)` = Σ IN − Σ OUT trên mọi phiếu chưa xoá mềm.
   * - `reserved(product)` = Σ trên các dòng đơn hàng đang mở (AWAITING_PRODUCTION/IN_PROGRESS) của
   *   `max(orderedQty − deliveredQty, 0)`, trong đó `deliveredQty` là tổng các dòng phiếu OUT gắn
   *   với dòng đơn hàng đó qua `orderItemId`.
   * - `excludeOrderId` loại hẳn một đơn khỏi tổng `reserved` — dùng cho `ProductionOrdersService`
   *   khi tính "Khả dụng" của một PO mà chính nó đã ở `AWAITING_PRODUCTION`/`IN_PROGRESS`, nên đã
   *   tự tính vào `reserved` và nếu không loại trừ sẽ bị trừ hai lần vào nhu cầu của chính nó (xem
   *   `docs/features/production.md`). `GET /inventory` không bao giờ truyền tham số này.
   */
  async getStockLevels(
    productIds: string[],
    excludeOrderId?: string,
  ): Promise<Map<string, { onHand: number; reserved: number }>> {
    if (!productIds.length) {
      return new Map();
    }

    const stock = this.stockSubquery();
    const reserved = this.reservedSubquery(excludeOrderId);

    const rows = await this.db
      .select({
        productId: products.id,
        onHand: sql<number>`coalesce(${stock.onHand}, 0)`.mapWith(Number),
        reserved: sql<number>`coalesce(${reserved.reserved}, 0)`.mapWith(
          Number,
        ),
      })
      .from(products)
      .leftJoin(stock, eq(stock.productId, products.id))
      .leftJoin(reserved, eq(reserved.productId, products.id))
      .where(inArray(products.id, productIds));

    return new Map(
      rows.map((row) => [
        row.productId,
        { onHand: row.onHand, reserved: row.reserved },
      ]),
    );
  }

  /** Per-product net quantity across every non-deleted receipt: IN adds, OUT subtracts. */
  private stockSubquery() {
    return this.db
      .select({
        productId: stockReceiptItems.productId,
        onHand:
          sql<number>`sum(case when ${stockReceipts.type} = ${StockReceiptType.IN} then ${stockReceiptItems.quantity} else -${stockReceiptItems.quantity} end)`
            .mapWith(Number)
            .as('on_hand'),
      })
      .from(stockReceiptItems)
      .innerJoin(
        stockReceipts,
        eq(stockReceipts.id, stockReceiptItems.receiptId),
      )
      .where(isNull(stockReceipts.deletedAt))
      .groupBy(stockReceiptItems.productId)
      .as('stock');
  }

  /** Per order line, how much has actually left the warehouse against it (OUT receipts only). */
  private deliveredSubquery() {
    return this.db
      .select({
        orderItemId: stockReceiptItems.orderItemId,
        deliveredQty: sql<number>`sum(${stockReceiptItems.quantity})`
          .mapWith(Number)
          .as('delivered_qty'),
      })
      .from(stockReceiptItems)
      .innerJoin(
        stockReceipts,
        eq(stockReceipts.id, stockReceiptItems.receiptId),
      )
      .where(
        and(
          eq(stockReceipts.type, StockReceiptType.OUT),
          isNull(stockReceipts.deletedAt),
        ),
      )
      .groupBy(stockReceiptItems.orderItemId)
      .as('delivered');
  }

  /**
   * Per product, how much of its still-open order demand hasn't shipped yet. "Open" means
   * approved (or further along) — `AWAITING_PRODUCTION`/`IN_PROGRESS` — now that `orders` has a
   * real approval gate (`OrdersService.approveOrder`). A `DRAFT`/`PENDING_CONFIRMATION` order
   * hasn't been approved by a director yet, so it doesn't hold stock against it.
   *
   * `excludeOrderId` loại hẳn một đơn khỏi tổng — xem doc comment của `getStockLevels`.
   */
  private reservedSubquery(excludeOrderId?: string) {
    const delivered = this.deliveredSubquery();

    return this.db
      .select({
        productId: orderItems.productId,
        reserved:
          sql<number>`sum(greatest(${orderItems.quantity} - coalesce(${delivered.deliveredQty}, 0), 0))`
            .mapWith(Number)
            .as('reserved'),
      })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .leftJoin(delivered, eq(delivered.orderItemId, orderItems.id))
      .where(
        and(
          eq(orderItems.status, OrderItemStatus.NORMAL),
          isNull(orders.deletedAt),
          inArray(orders.status, [
            OrderStatus.AWAITING_PRODUCTION,
            OrderStatus.IN_PROGRESS,
          ]),
          excludeOrderId ? ne(orders.id, excludeOrderId) : undefined,
        ),
      )
      .groupBy(orderItems.productId)
      .as('reserved');
  }
}
