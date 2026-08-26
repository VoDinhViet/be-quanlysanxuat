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
  warehouses,
  WarehouseType,
} from '../../database/schemas';
import {
  remainingBomDemandByItemSubquery,
  requisitionHeldQuantityByItemSubquery,
  reservedQuantitySubquery,
} from '../inventory-requisitions/inventory-requisitions.query';
import { outboundHeldQuantityByItemSubquery } from '../outbound-orders/outbound-orders.query';
import { GetInventoryBalancesReqDto } from './dto/get-inventory-balances.req.dto';
import { GetInventoryReqDto } from './dto/get-inventory.req.dto';
import { GetInventoryTransactionsReqDto } from './dto/get-inventory-transactions.req.dto';
import { InventoryBalanceResDto } from './dto/inventory-balance.res.dto';
import { InventoryItemResDto } from './dto/inventory-item.res.dto';
import { InventoryTransactionResDto } from './dto/inventory-transaction.res.dto';
import { StockStatus } from './inventory.constant';

/** Đọc tồn — mọi số tính từ `inventory_balances` (bản chiếu `InventoryPostingService` ghi lúc
 * `post`/`cancel`), `order_items`/`outbound_order_items` (FG) và `inventory_requisition_items`/
 * `production_job_issues` (RM), gộp mọi kho trừ khi `warehouseId` được truyền. */
@Injectable()
export class InventoryService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** Liệt kê mọi item ACTIVE (bỏ trống `itemType` = FG/RM — kho không quản tồn WIP,
   * `docs/decisions/wip-not-stocked.md`), kể cả item chưa từng có phiếu nào — không chỉ item có
   * phát sinh kho. Không thể phân trang trên `items` rồi tra tồn riêng — filter `status`/`itemType`
   * (giá trị tính hoặc cần điều kiện tuỳ chọn trong `WHERE`) nên toàn bộ join + tính toán nằm trong
   * một `.select()` duy nhất, dùng chung `where` cho cả trang lẫn `count()`. */
  async getInventory(
    reqDto: GetInventoryReqDto,
  ): Promise<OffsetPaginatedDto<InventoryItemResDto>> {
    const stock = this.balanceSubquery(reqDto.asOfDate, reqDto.warehouseId);
    const openOrderDemand = this.openOrderDemandSubquery();
    const outboundHeld = outboundHeldQuantityByItemSubquery(this.db);
    const requisitionHeld = requisitionHeldQuantityByItemSubquery(
      this.db,
      reqDto.warehouseId,
    );
    const bomRemaining = remainingBomDemandByItemSubquery(this.db);
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;

    const onHandSql = () => sql<number>`coalesce(${stock.onHand}, 0)`;

    // Khối RM — nhu cầu Job trừ phần phiếu lãnh đã giữ.
    const rmHeldSql = () =>
      sql<number>`coalesce(${requisitionHeld.heldQuantity}, 0)`;
    const rmDemandSql = () =>
      sql<number>`greatest(coalesce(${bomRemaining.remainingDemand}, 0) - (${rmHeldSql()}), 0)`;

    // Khối FG — nhu cầu đơn hàng mở trừ phần DO đã giữ.
    const fgHeldSql = () =>
      sql<number>`coalesce(${outboundHeld.heldQuantity}, 0)`;
    const fgDemandSql = () =>
      sql<number>`greatest(coalesce(${openOrderDemand.demand}, 0) - (${fgHeldSql()}), 0)`;

    /** `reserved` = tổng "Đã giữ" của RM (phiếu lãnh `APPROVED`) và FG (DO `PENDING_APPROVAL`/
     * `PENDING_DELIVERY`); `bomDemand` = phần nhu cầu CHƯA có chứng từ nào giữ, trừ theo đúng cặp
     * RM/FG (không trộn) để không bị trừ hai lần — một phiếu lãnh `APPROVED` vừa nằm trong
     * `reserved` vừa nằm trong `remainingBomDemand` (chỉ trừ phần `ISSUED`), cộng thẳng sẽ ra
     * `available` sai. Xem `docs/domains/inventory.md`. */
    const reservedSql = () => sql<number>`(${rmHeldSql()}) + (${fgHeldSql()})`;
    const bomDemandSql = () =>
      sql<number>`(${rmDemandSql()}) + (${fgDemandSql()})`;
    const availableSql = () =>
      sql<number>`(${onHandSql()}) - (${reservedSql()}) - (${bomDemandSql()})`;

    const where = and(
      isNull(items.deletedAt),
      eq(items.status, ItemStatus.ACTIVE),
      // Bỏ trống `itemType` = FG/RM (kho không quản tồn WIP,
      // `docs/decisions/wip-not-stocked.md`) — gửi tường minh `itemType=WIP` vẫn xem được.
      reqDto.itemType
        ? eq(items.type, reqDto.itemType)
        : inArray(items.type, [ItemType.FG, ItemType.RM]),
      keyword
        ? or(
            unaccentILike(items.code, keyword),
            unaccentILike(items.name, keyword),
          )
        : undefined,
      reqDto.supplierId ? eq(items.supplierId, reqDto.supplierId) : undefined,
      reqDto.status
        ? this.stockStatusCondition(availableSql, reqDto.status)
        : undefined,
    );

    const [rows, countRows] = await Promise.all([
      this.db
        .select({
          id: items.id,
          code: items.code,
          name: items.name,
          type: items.type,
          unit: getTableColumns(units),
          supplier: getTableColumns(suppliers),
          image: getTableColumns(files),
          minStock: items.minStock,
          onHand: onHandSql().mapWith(Number).as('on_hand'),
          reserved: reservedSql().mapWith(Number).as('reserved'),
          bomDemand: bomDemandSql().mapWith(Number).as('bom_demand'),
          available: availableSql().mapWith(Number).as('available'),
        })
        .from(items)
        .innerJoin(units, eq(units.id, items.unitId))
        .leftJoin(suppliers, eq(suppliers.id, items.supplierId))
        .leftJoin(files, eq(files.id, items.imageFileId))
        .leftJoin(stock, eq(stock.itemId, items.id))
        .leftJoin(openOrderDemand, eq(openOrderDemand.itemId, items.id))
        .leftJoin(outboundHeld, eq(outboundHeld.itemId, items.id))
        .leftJoin(requisitionHeld, eq(requisitionHeld.itemId, items.id))
        .leftJoin(bomRemaining, eq(bomRemaining.itemId, items.id))
        .where(where)
        .orderBy(asc(items.code))
        .limit(reqDto.limit)
        .offset(reqDto.offset),
      this.db
        .select({ total: count() })
        .from(items)
        .leftJoin(stock, eq(stock.itemId, items.id))
        .leftJoin(openOrderDemand, eq(openOrderDemand.itemId, items.id))
        .leftJoin(outboundHeld, eq(outboundHeld.itemId, items.id))
        .leftJoin(requisitionHeld, eq(requisitionHeld.itemId, items.id))
        .leftJoin(bomRemaining, eq(bomRemaining.itemId, items.id))
        .where(where),
    ]);

    const rowsWithStatus = rows.map((row) => ({
      ...row,
      status: this.resolveStockStatus(row.available, row.minStock),
    }));

    return new OffsetPaginatedDto(
      plainToInstance(InventoryItemResDto, rowsWithStatus, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(countRows[0]?.total ?? 0, reqDto),
    );
  }

  /** Tồn thô theo (kho × mặt hàng). `reservedQuantity` KHÔNG đọc cột cùng tên trên
   * `inventory_balances` (cột đó vẫn luôn 0, chưa route nào ghi) — điền số tính động lúc đọc: phiếu
   * lãnh `APPROVED` theo đúng kho, cộng DO `PENDING_APPROVAL`/`PENDING_DELIVERY` chỉ trên dòng kho
   * `type = FG` (DO không có cột kho). Giữ nguyên hợp đồng API cũ, xem
   * `docs/domains/inventory.md`. */
  async getInventoryBalances(
    reqDto: GetInventoryBalancesReqDto,
  ): Promise<OffsetPaginatedDto<InventoryBalanceResDto>> {
    const requisitionHeld = reservedQuantitySubquery(this.db);
    const outboundHeld = outboundHeldQuantityByItemSubquery(this.db);

    const where = and(
      reqDto.warehouseId
        ? eq(inventoryBalances.warehouseId, reqDto.warehouseId)
        : undefined,
      // Bỏ trống `itemType` = FG/RM (kho không quản tồn WIP,
      // `docs/decisions/wip-not-stocked.md`) — gửi tường minh `itemType=WIP` vẫn xem được.
      inArray(
        inventoryBalances.itemId,
        this.db
          .select({ id: items.id })
          .from(items)
          .where(
            reqDto.itemType
              ? eq(items.type, reqDto.itemType)
              : inArray(items.type, [ItemType.FG, ItemType.RM]),
          ),
      ),
    );

    const rmHeldSql = sql<number>`coalesce(${requisitionHeld.reservedQuantity}, 0)`;
    const fgHeldSql = sql<number>`coalesce(${outboundHeld.heldQuantity}, 0)`;

    const [rows, countRows] = await Promise.all([
      this.db
        .select({
          ...getTableColumns(inventoryBalances),
          warehouse: getTableColumns(warehouses),
          item: getTableColumns(items),
          // Sau spread để thắng cột thật `reservedQuantity` (`.claude/rules/service.md`).
          reservedQuantity:
            sql<number>`(${rmHeldSql}) + (${fgHeldSql})`.mapWith(Number),
        })
        .from(inventoryBalances)
        .innerJoin(warehouses, eq(warehouses.id, inventoryBalances.warehouseId))
        .innerJoin(items, eq(items.id, inventoryBalances.itemId))
        .leftJoin(
          requisitionHeld,
          and(
            eq(requisitionHeld.warehouseId, inventoryBalances.warehouseId),
            eq(requisitionHeld.itemId, inventoryBalances.itemId),
          ),
        )
        // DO không có cột kho — chỉ gán "Đã giữ" FG lên dòng của kho `type = FG`. Ngầm định đúng 1
        // kho FG, cùng bất biến `OutboundOrdersService.resolveFgWarehouseId` ép cứng (`E238`); nếu
        // sau này có ≥2 kho FG, nhánh ghi báo lỗi ngay còn nhánh đọc này sẽ cộng nhầm.
        .leftJoin(
          outboundHeld,
          and(
            eq(outboundHeld.itemId, inventoryBalances.itemId),
            eq(warehouses.type, WarehouseType.FG),
          ),
        )
        .where(where)
        .orderBy(desc(inventoryBalances.updatedAt))
        .limit(reqDto.limit)
        .offset(reqDto.offset),
      this.db.select({ total: count() }).from(inventoryBalances).where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(InventoryBalanceResDto, rows, {
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
      reqDto.startDate
        ? gte(inventoryTransactions.transactionDate, reqDto.startDate)
        : undefined,
      // Exclusive next-day boundary — `endDate` parses to midnight UTC, `lte` would drop same-day rows.
      reqDto.endDate
        ? lt(
            inventoryTransactions.transactionDate,
            new Date(reqDto.endDate.getTime() + 24 * 60 * 60 * 1000),
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
  private stockStatusCondition(
    availableSql: () => SQL<number>,
    status: StockStatus,
  ) {
    switch (status) {
      case StockStatus.SHORTAGE:
        return sql`(${availableSql()}) < 0`;
      case StockStatus.WARNING:
        return sql`(${availableSql()}) >= 0 and (${availableSql()}) < ${items.minStock}`;
      case StockStatus.NORMAL:
        return sql`(${availableSql()}) >= ${items.minStock}`;
    }
  }

  /** Cùng ba ngưỡng với `stockStatusCondition`, tính trong JS. */
  private resolveStockStatus(available: number, minStock: number): StockStatus {
    if (available < 0) {
      return StockStatus.SHORTAGE;
    }
    if (available < minStock) {
      return StockStatus.WARNING;
    }
    return StockStatus.NORMAL;
  }

  /** `excludeOrderId` loại một đơn khỏi nhu cầu khi tính Khả dụng cho chính đơn đó — đơn này đã tự
   * tính vào nhu cầu nên không loại trừ sẽ bị trừ hai lần. Chỉ `ProductionOrdersService` truyền
   * tham số này — `GET /inventory` gọi `openOrderDemandSubquery` trực tiếp trong `getInventory`,
   * không qua hàm này. Luôn gộp mọi kho. Field `reserved` trả ra đây là nhu cầu đơn hàng mở — KHÁC
   * `reserved` của `GET /inventory` (đã có chứng từ giữ), xem `docs/domains/inventory.md`. */
  async getStockLevels(
    itemIds: string[],
    excludeOrderId?: string,
  ): Promise<Map<string, { onHand: number; reserved: number }>> {
    if (!itemIds.length) {
      return new Map();
    }

    const balance = this.balanceSubquery();
    const openOrderDemand = this.openOrderDemandSubquery(excludeOrderId);

    const rows = await this.db
      .select({
        itemId: items.id,
        onHand: sql<number>`coalesce(${balance.onHand}, 0)`.mapWith(Number),
        reserved: sql<number>`coalesce(${openOrderDemand.demand}, 0)`.mapWith(
          Number,
        ),
      })
      .from(items)
      .leftJoin(balance, eq(balance.itemId, items.id))
      .leftJoin(openOrderDemand, eq(openOrderDemand.itemId, items.id))
      .where(inArray(items.id, itemIds));

    return new Map(
      rows.map((row) => [
        row.itemId,
        { onHand: row.onHand, reserved: row.reserved },
      ]),
    );
  }

  /** Per-item on-hand, luôn gộp mọi kho. */
  async getMaterialStockLevels(
    itemIds: string[],
  ): Promise<Map<string, number>> {
    if (!itemIds.length) {
      return new Map();
    }

    const balance = this.balanceSubquery();

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
   * duyệt nên chưa tính vào đây. `excludeOrderId` xem `getStockLevels`. Tên hàm cố ý không dùng chữ
   * "reserved" — khác khái niệm "đã có chứng từ giữ" ở `getInventory`
   * (`docs/domains/inventory.md`). */
  private openOrderDemandSubquery(excludeOrderId?: string) {
    const delivered = this.deliveredSubquery();

    return this.db
      .select({
        itemId: orderItems.itemId,
        demand:
          sql<number>`sum(greatest(${orderItems.quantity} - coalesce(${delivered.deliveredQty}, 0), 0))`
            .mapWith(Number)
            .as('open_order_demand'),
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
      .as('open_order_demand');
  }
}
