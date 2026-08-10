import { Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  gte,
  inArray,
  isNull,
  lt,
  lte,
  ne,
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
  inventoryBalances,
  inventoryTransactions,
  items,
  ItemStatus,
  ItemType,
  orderItems,
  orders,
  OrderItemStatus,
  OrderStatus,
  suppliers,
  units,
} from '../../database/schemas';
import { GetInventoryBalancesReqDto } from './dto/get-inventory-balances.req.dto';
import { GetInventoryReqDto } from './dto/get-inventory.req.dto';
import { GetInventoryTransactionsReqDto } from './dto/get-inventory-transactions.req.dto';
import { GetMaterialInventoryReqDto } from './dto/get-material-inventory.req.dto';
import { InventoryBalanceResDto } from './dto/inventory-balance.res.dto';
import { InventoryItemResDto } from './dto/inventory-item.res.dto';
import { InventoryTransactionResDto } from './dto/inventory-transaction.res.dto';
import { MaterialInventoryItemResDto } from './dto/material-inventory-item.res.dto';
import { MaterialStockStatus } from './inventory.constant';

/** Đọc tồn — mọi số tính từ `inventory_balances` (bản chiếu `InventoryPostingService` ghi lúc
 * `post`/`cancel`) và `order_items`, gộp mọi kho trừ khi `warehouseId` được truyền. */
@Injectable()
export class InventoryService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** Liệt kê mọi FG ACTIVE, kể cả item chưa từng có phiếu nào — không chỉ item có phát sinh
   * kho. Phân trang/lọc chạy trên `items`, `onHand`/`reserved` chỉ tra cho trang hiện tại. */
  async getInventory(
    reqDto: GetInventoryReqDto,
  ): Promise<OffsetPaginatedDto<InventoryItemResDto>> {
    const where = and(
      eq(items.type, ItemType.FG),
      eq(items.status, ItemStatus.ACTIVE),
      isNull(items.deletedAt),
    );

    const [entities, countRows] = await Promise.all([
      this.db.query.items.findMany({
        where,
        limit: reqDto.limit,
        offset: reqDto.offset,
        orderBy: asc(items.code),
        with: { unit: true, imageFile: true },
      }),
      this.db.select({ total: count() }).from(items).where(where),
    ]);

    const stockByItem = await this.getStockLevels(
      entities.map((item) => item.id),
      undefined,
      reqDto.warehouseId,
    );

    const rows = entities.map((item) => {
      const stock = stockByItem.get(item.id) ?? {
        onHand: 0,
        reserved: 0,
      };
      return {
        ...item,
        onHand: stock.onHand,
        reserved: stock.reserved,
        available: stock.onHand - stock.reserved,
      };
    });

    return new OffsetPaginatedDto(
      plainToInstance(InventoryItemResDto, rows, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(countRows[0]?.total ?? 0, reqDto),
    );
  }

  /** Không thể phân trang trên `items` rồi tra tồn riêng như `getInventory` — filter `status`
   * (giá trị tính, không phải cột thật) phải chạy trong `WHERE`, nên toàn bộ join + tính toán nằm
   * trong một `.select()` duy nhất, dùng chung `where` cho cả trang lẫn `count()`. */
  async getMaterialInventory(
    reqDto: GetMaterialInventoryReqDto,
  ): Promise<OffsetPaginatedDto<MaterialInventoryItemResDto>> {
    const stock = this.balanceSubquery(reqDto.asOfDate, reqDto.warehouseId);
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;

    const onHandSql = () => sql<number>`coalesce(${stock.onHand}, 0)`;
    // Literal `0` — đợt nổ BOM đa cấp sau này chỉ cần thay hàm này bằng subquery thật, công thức
    // `available`/`status` không phải sửa.
    const bomDemandSql = () => sql<number>`0`;
    const availableSql = () =>
      sql<number>`(${onHandSql()}) - (${bomDemandSql()})`;

    const where = and(
      eq(items.type, ItemType.RM),
      isNull(items.deletedAt),
      eq(items.status, ItemStatus.ACTIVE),
      keyword
        ? or(
            unaccentILike(items.code, keyword),
            unaccentILike(items.name, keyword),
          )
        : undefined,
      reqDto.supplierId ? eq(items.supplierId, reqDto.supplierId) : undefined,
      reqDto.status
        ? this.materialStatusCondition(availableSql, reqDto.status)
        : undefined,
    );

    const [rows, countRows] = await Promise.all([
      this.db
        .select({
          id: items.id,
          code: items.code,
          name: items.name,
          unit: getTableColumns(units),
          supplier: getTableColumns(suppliers),
          image: getTableColumns(files),
          minStock: items.minStock,
          onHand: onHandSql().mapWith(Number).as('on_hand'),
          reserved: sql<number>`0`.mapWith(Number).as('reserved'),
          issuable: onHandSql().mapWith(Number).as('issuable'),
          bomDemand: bomDemandSql().mapWith(Number).as('bom_demand'),
          available: availableSql().mapWith(Number).as('available'),
        })
        .from(items)
        .innerJoin(units, eq(units.id, items.unitId))
        .leftJoin(suppliers, eq(suppliers.id, items.supplierId))
        .leftJoin(files, eq(files.id, items.imageFileId))
        .leftJoin(stock, eq(stock.itemId, items.id))
        .where(where)
        .orderBy(asc(items.code))
        .limit(reqDto.limit)
        .offset(reqDto.offset),
      this.db
        .select({ total: count() })
        .from(items)
        .leftJoin(stock, eq(stock.itemId, items.id))
        .where(where),
    ]);

    const rowsWithStatus = rows.map((row) => ({
      ...row,
      status: this.materialStockStatus(row.available, row.minStock),
    }));

    return new OffsetPaginatedDto(
      plainToInstance(MaterialInventoryItemResDto, rowsWithStatus, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(countRows[0]?.total ?? 0, reqDto),
    );
  }

  /** Tồn thô theo (kho × mặt hàng) — đọc thẳng `inventory_balances`, không tính lại. */
  async getInventoryBalances(
    reqDto: GetInventoryBalancesReqDto,
  ): Promise<OffsetPaginatedDto<InventoryBalanceResDto>> {
    const where = and(
      reqDto.warehouseId
        ? eq(inventoryBalances.warehouseId, reqDto.warehouseId)
        : undefined,
      reqDto.itemType
        ? inArray(
            inventoryBalances.itemId,
            this.db
              .select({ id: items.id })
              .from(items)
              .where(eq(items.type, reqDto.itemType)),
          )
        : undefined,
    );

    const [entities, countRows] = await Promise.all([
      this.db.query.inventoryBalances.findMany({
        where,
        limit: reqDto.limit,
        offset: reqDto.offset,
        orderBy: desc(inventoryBalances.updatedAt),
        with: { warehouse: true, item: true },
      }),
      this.db.select({ total: count() }).from(inventoryBalances).where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(InventoryBalanceResDto, entities, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(countRows[0]?.total ?? 0, reqDto),
    );
  }

  /** Sổ cái — đọc thẳng `inventory_transactions`, chỉ ghi được qua `InventoryPostingService`. */
  async getInventoryTransactions(
    reqDto: GetInventoryTransactionsReqDto,
  ): Promise<OffsetPaginatedDto<InventoryTransactionResDto>> {
    const where = and(
      reqDto.warehouseId
        ? eq(inventoryTransactions.warehouseId, reqDto.warehouseId)
        : undefined,
      reqDto.itemType
        ? inArray(
            inventoryTransactions.itemId,
            this.db
              .select({ id: items.id })
              .from(items)
              .where(eq(items.type, reqDto.itemType)),
          )
        : undefined,
      reqDto.itemId
        ? eq(inventoryTransactions.itemId, reqDto.itemId)
        : undefined,
      reqDto.type ? eq(inventoryTransactions.type, reqDto.type) : undefined,
      reqDto.referenceType
        ? eq(inventoryTransactions.referenceType, reqDto.referenceType)
        : undefined,
      reqDto.fromDate
        ? gte(inventoryTransactions.transactionDate, reqDto.fromDate)
        : undefined,
      // Exclusive next-day boundary — `toDate` parses to midnight UTC, `lte` would drop same-day rows.
      reqDto.toDate
        ? lt(
            inventoryTransactions.transactionDate,
            new Date(reqDto.toDate.getTime() + 24 * 60 * 60 * 1000),
          )
        : undefined,
    );

    const [entities, countRows] = await Promise.all([
      this.db.query.inventoryTransactions.findMany({
        where,
        limit: reqDto.limit,
        offset: reqDto.offset,
        orderBy: [
          desc(inventoryTransactions.transactionDate),
          desc(inventoryTransactions.createdAt),
        ],
        with: { warehouse: true, item: true, creatorBy: true },
      }),
      this.db
        .select({ total: count() })
        .from(inventoryTransactions)
        .where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(InventoryTransactionResDto, entities, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(countRows[0]?.total ?? 0, reqDto),
    );
  }

  /** Trả boolean SQL trực tiếp (không qua CASE) — chỉ phục vụ lọc `WHERE`, không cần hiển thị. */
  private materialStatusCondition(
    availableSql: () => SQL<number>,
    status: MaterialStockStatus,
  ) {
    switch (status) {
      case MaterialStockStatus.SHORTAGE:
        return sql`(${availableSql()}) < 0`;
      case MaterialStockStatus.WARNING:
        return sql`(${availableSql()}) >= 0 and (${availableSql()}) < ${items.minStock}`;
      case MaterialStockStatus.NORMAL:
        return sql`(${availableSql()}) >= ${items.minStock}`;
    }
  }

  /** Cùng ba ngưỡng với `materialStatusCondition`, tính trong JS. */
  private materialStockStatus(
    available: number,
    minStock: number,
  ): MaterialStockStatus {
    if (available < 0) {
      return MaterialStockStatus.SHORTAGE;
    }
    if (available < minStock) {
      return MaterialStockStatus.WARNING;
    }
    return MaterialStockStatus.NORMAL;
  }

  /** `excludeOrderId` loại một đơn khỏi `reserved` khi tính Khả dụng cho chính đơn đó — đơn này đã
   * tự giữ chỗ nên không loại trừ sẽ bị trừ nhu cầu của nó hai lần. Chỉ `ProductionOrdersService`
   * truyền tham số này; `GET /inventory` luôn để trống. `warehouseId` gộp mọi kho nếu bỏ trống. */
  async getStockLevels(
    itemIds: string[],
    excludeOrderId?: string,
    warehouseId?: string,
  ): Promise<Map<string, { onHand: number; reserved: number }>> {
    if (!itemIds.length) {
      return new Map();
    }

    const balance = this.balanceSubquery(undefined, warehouseId);
    const reserved = this.reservedSubquery(excludeOrderId);

    const rows = await this.db
      .select({
        itemId: items.id,
        onHand: sql<number>`coalesce(${balance.onHand}, 0)`.mapWith(Number),
        reserved: sql<number>`coalesce(${reserved.reserved}, 0)`.mapWith(
          Number,
        ),
      })
      .from(items)
      .leftJoin(balance, eq(balance.itemId, items.id))
      .leftJoin(reserved, eq(reserved.itemId, items.id))
      .where(inArray(items.id, itemIds));

    return new Map(
      rows.map((row) => [
        row.itemId,
        { onHand: row.onHand, reserved: row.reserved },
      ]),
    );
  }

  /** Per-item on-hand, gộp mọi kho trừ khi `warehouseId` được truyền. */
  async getMaterialStockLevels(
    itemIds: string[],
    warehouseId?: string,
  ): Promise<Map<string, number>> {
    if (!itemIds.length) {
      return new Map();
    }

    const balance = this.balanceSubquery(undefined, warehouseId);

    const rows = await this.db
      .select({
        itemId: items.id,
        onHand: sql<number>`coalesce(${balance.onHand}, 0)`.mapWith(Number),
      })
      .from(items)
      .leftJoin(balance, eq(balance.itemId, items.id))
      .where(inArray(items.id, itemIds));

    return new Map(rows.map((row) => [row.itemId, row.onHand]));
  }

  /** Tồn theo item — gộp `inventory_balances` (tồn hiện tại) trừ khi `asOfDate` được truyền, khi
   * đó cộng lại từ `inventory_transactions` với `transactionDate <= asOfDate`. Không tự lọc theo
   * loại item — nơi gọi join/lọc `items` ở tầng ngoài, subquery chỉ gộp theo `itemId`. */
  private balanceSubquery(asOfDate?: Date, warehouseId?: string) {
    if (asOfDate) {
      return this.db
        .select({
          itemId: inventoryTransactions.itemId,
          onHand: sql<number>`sum(${inventoryTransactions.quantity})`
            .mapWith(Number)
            .as('on_hand'),
        })
        .from(inventoryTransactions)
        .where(
          and(
            lte(inventoryTransactions.transactionDate, asOfDate),
            warehouseId
              ? eq(inventoryTransactions.warehouseId, warehouseId)
              : undefined,
          ),
        )
        .groupBy(inventoryTransactions.itemId)
        .as('item_on_hand');
    }

    return this.db
      .select({
        itemId: inventoryBalances.itemId,
        onHand: sql<number>`sum(${inventoryBalances.quantity})`
          .mapWith(Number)
          .as('on_hand'),
      })
      .from(inventoryBalances)
      .where(
        warehouseId
          ? eq(inventoryBalances.warehouseId, warehouseId)
          : undefined,
      )
      .groupBy(inventoryBalances.itemId)
      .as('item_balance');
  }

  /** Mỗi dòng đơn hàng đã thực xuất kho bao nhiêu — cộng `-quantity` trên mọi bút toán có
   * `orderItemId`. Một phiếu xuất `post` ghi dòng âm; huỷ phiếu (`cancel`) ghi thêm dòng đảo dấu
   * dương cùng `orderItemId` nên tự triệt tiêu, không cần lọc theo trạng thái phiếu. */
  private deliveredSubquery() {
    return this.db
      .select({
        orderItemId: inventoryTransactions.orderItemId,
        deliveredQty: sql<number>`sum(-${inventoryTransactions.quantity})`
          .mapWith(Number)
          .as('delivered_qty'),
      })
      .from(inventoryTransactions)
      .where(sql`${inventoryTransactions.orderItemId} IS NOT NULL`)
      .groupBy(inventoryTransactions.orderItemId)
      .as('delivered');
  }

  /** Với mỗi item, phần nhu cầu đơn đang mở chưa giao. "Mở" nghĩa là đã qua cổng duyệt
   * (`AWAITING_PRODUCTION`/`IN_PROGRESS`) — đơn `DRAFT`/`PENDING_CONFIRMATION` chưa được Giám đốc
   * duyệt nên chưa giữ chỗ tồn. `excludeOrderId` xem `getStockLevels`. */
  private reservedSubquery(excludeOrderId?: string) {
    const delivered = this.deliveredSubquery();

    return this.db
      .select({
        itemId: orderItems.itemId,
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
      .groupBy(orderItems.itemId)
      .as('reserved');
  }
}
