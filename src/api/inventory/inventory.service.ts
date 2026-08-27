import { Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import {
  and,
  count,
  desc,
  eq,
  getTableColumns,
  gte,
  inArray,
  lt,
  sql,
} from 'drizzle-orm';

import { OffsetPaginationDto } from '../../common/dto/offset-pagination/offset-pagination.dto';
import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import {
  inventoryBalances,
  inventoryTransactions,
  items,
  ItemType,
  warehouses,
  WarehouseType,
} from '../../database/schemas';
import { reservedQuantitySubquery } from '../inventory-requisitions/inventory-requisitions.query';
import { outboundHeldQuantityByItemSubquery } from '../outbound-orders/outbound-orders.query';
import { GetInventoryBalancesReqDto } from './dto/get-inventory-balances.req.dto';
import { GetInventoryTransactionsReqDto } from './dto/get-inventory-transactions.req.dto';
import { InventoryBalanceResDto } from './dto/inventory-balance.res.dto';
import { InventoryTransactionResDto } from './dto/inventory-transaction.res.dto';
import {
  balanceByItemSubquery,
  openOrderDemandByItemSubquery,
} from './inventory.query';

/** Đọc tồn thô (kho×item) + sổ cái + tra cứu nội bộ dùng bởi các module khác — list Tồn kho thành
 * phẩm/vật tư nay sống ở `inventory-products`/`inventory-materials`
 * (`docs/domains/inventory.md`). */
@Injectable()
export class InventoryService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** Tồn thô theo (kho × mặt hàng). `reservedQuantity` KHÔNG đọc cột cùng tên trên
   * `inventory_balances` (cột đó vẫn luôn 0, chưa route nào ghi) — điền số tính động lúc đọc: phiếu
   * lãnh `DRAFT`/`PENDING_APPROVAL`/`APPROVED` theo đúng kho (giữ từ lúc tạo, BUG-087), cộng DO
   * `DRAFT`/`PENDING_APPROVAL`/`PENDING_DELIVERY` chỉ trên dòng kho `type = FG` (DO không có cột
   * kho). Giữ nguyên hợp đồng API cũ, xem `docs/domains/inventory.md`. */
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

  /** `excludeOrderId` xem `openOrderDemandByItemSubquery`. Chỉ `ProductionOrdersService` truyền
   * tham số này. Field `reserved` trả ra đây là nhu cầu đơn hàng mở — KHÁC `reserved` của
   * `inventory-products.service.ts` (đã có chứng từ giữ), xem `docs/domains/inventory.md`. */
  async getStockLevels(
    itemIds: string[],
    excludeOrderId?: string,
  ): Promise<Map<string, { onHand: number; reserved: number }>> {
    if (!itemIds.length) {
      return new Map();
    }

    const balance = balanceByItemSubquery(this.db);
    const openOrderDemand = openOrderDemandByItemSubquery(
      this.db,
      excludeOrderId,
    );

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

    const balance = balanceByItemSubquery(this.db);

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
}
