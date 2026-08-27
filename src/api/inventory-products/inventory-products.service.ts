import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  isNull,
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
  files,
  inventoryIssues,
  inventoryReceipts,
  InventoryReferenceType,
  inventoryTransactions,
  items,
  ItemStatus,
  ItemType,
  orderItems,
  orders,
  outboundOrders,
  productionJobs,
  units,
  users,
  warehouses,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import {
  balanceByItemSubquery,
  openOrderDemandByItemSubquery,
  stockStatusCondition,
} from '../inventory/inventory.query';
import { outboundHeldQuantityByItemSubquery } from '../outbound-orders/outbound-orders.query';
import { GetInventoryProductsReqDto } from './dto/get-inventory-products.req.dto';
import { GetProductLedgerReqDto } from './dto/get-product-ledger.req.dto';
import { InventoryProductResDto } from './dto/inventory-product.res.dto';
import { ProductLedgerEntryResDto } from './dto/product-ledger-entry.res.dto';
import {
  productLedgerDateRangeCondition,
  productLedgerSubquery,
} from './product-ledger.query';

/** Tồn kho thành phẩm — nhánh FG tách khỏi `InventoryService.getInventory` cũ
 * (`docs/domains/inventory.md`). RM sống ở `inventory-materials`, không nhánh nào đọc chéo sang
 * nhánh kia. */
@Injectable()
export class InventoryProductsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** Liệt kê mọi thành phẩm ACTIVE, kể cả chưa từng phát sinh kho — không phân trang trên `items`
   * rồi tra tồn riêng, cùng lý do `InventoryService.getInventory` cũ: filter `status` là giá trị
   * tính nên toàn bộ join + tính toán phải nằm trong một `.select()` duy nhất. */
  async getInventoryProducts(
    reqDto: GetInventoryProductsReqDto,
  ): Promise<OffsetPaginatedDto<InventoryProductResDto>> {
    const stock = balanceByItemSubquery(
      this.db,
      reqDto.asOfDate,
      reqDto.warehouseId,
    );
    const openOrderDemand = openOrderDemandByItemSubquery(this.db);
    const outboundHeld = outboundHeldQuantityByItemSubquery(this.db);
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;

    const onHandSql = () => sql<number>`coalesce(${stock.onHand}, 0)`;
    const reservedSql = () =>
      sql<number>`coalesce(${outboundHeld.heldQuantity}, 0)`;
    const bomDemandSql = () =>
      sql<number>`greatest(coalesce(${openOrderDemand.demand}, 0) - (${reservedSql()}), 0)`;
    const availableSql = () =>
      sql<number>`(${onHandSql()}) - (${reservedSql()}) - (${bomDemandSql()})`;

    const where = and(
      isNull(items.deletedAt),
      eq(items.status, ItemStatus.ACTIVE),
      eq(items.type, ItemType.FG),
      reqDto.itemId ? eq(items.id, reqDto.itemId) : undefined,
      keyword
        ? or(
            unaccentILike(items.code, keyword),
            unaccentILike(items.name, keyword),
          )
        : undefined,
      reqDto.status
        ? stockStatusCondition(availableSql, reqDto.status)
        : undefined,
    );

    const [rows, countRows] = await Promise.all([
      this.db
        .select({
          id: items.id,
          code: items.code,
          name: items.name,
          unit: getTableColumns(units),
          image: getTableColumns(files),
          onHand: onHandSql().mapWith(Number).as('on_hand'),
          reserved: reservedSql().mapWith(Number).as('reserved'),
          bomDemand: bomDemandSql().mapWith(Number).as('bom_demand'),
          available: availableSql().mapWith(Number).as('available'),
        })
        .from(items)
        .innerJoin(units, eq(units.id, items.unitId))
        .leftJoin(files, eq(files.id, items.imageFileId))
        .leftJoin(stock, eq(stock.itemId, items.id))
        .leftJoin(openOrderDemand, eq(openOrderDemand.itemId, items.id))
        .leftJoin(outboundHeld, eq(outboundHeld.itemId, items.id))
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
        .where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(InventoryProductResDto, rows, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(countRows[0]?.total ?? 0, reqDto),
    );
  }

  /** Sổ cái (thẻ kho) — lịch sử bút toán của một thành phẩm, tồn luỹ kế sau từng giao dịch
   * (`docs/domains/inventory.md`, mục "Thẻ kho vật chất — item ledger"). */
  async getProductLedger(
    itemId: string,
    reqDto: GetProductLedgerReqDto,
  ): Promise<OffsetPaginatedDto<ProductLedgerEntryResDto>> {
    await this.ensureFinishedGoodExists(itemId);

    const ledger = productLedgerSubquery(this.db, itemId, reqDto.warehouseId);

    const [rows, countRows] = await Promise.all([
      this.db
        .select({
          id: ledger.id,
          transactionDate: ledger.transactionDate,
          createdAt: ledger.createdAt,
          quantity: ledger.quantity,
          balanceAfter: ledger.balanceAfter,
          warehouse: getTableColumns(warehouses),
          inventoryReceipt: getTableColumns(inventoryReceipts),
          inventoryIssue: getTableColumns(inventoryIssues),
          productionJob: getTableColumns(productionJobs),
          order: getTableColumns(orders),
          outboundOrder: getTableColumns(outboundOrders),
          note: sql<
            string | null
          >`coalesce(${inventoryReceipts.note}, ${inventoryIssues.note})`,
          creatorBy: getTableColumns(users),
        })
        .from(ledger)
        .innerJoin(warehouses, eq(warehouses.id, ledger.warehouseId))
        .leftJoin(
          inventoryReceipts,
          and(
            eq(ledger.referenceType, InventoryReferenceType.INVENTORY_RECEIPT),
            eq(inventoryReceipts.id, ledger.referenceId),
          ),
        )
        .leftJoin(
          inventoryIssues,
          and(
            eq(ledger.referenceType, InventoryReferenceType.INVENTORY_ISSUE),
            eq(inventoryIssues.id, ledger.referenceId),
          ),
        )
        .leftJoin(
          productionJobs,
          eq(
            productionJobs.id,
            sql`coalesce(${inventoryReceipts.productionJobId}, ${inventoryIssues.productionJobId})`,
          ),
        )
        .leftJoin(orderItems, eq(orderItems.id, ledger.orderItemId))
        .leftJoin(orders, eq(orders.id, orderItems.orderId))
        .leftJoin(
          outboundOrders,
          eq(outboundOrders.id, inventoryIssues.outboundOrderId),
        )
        .leftJoin(users, eq(users.id, ledger.createdBy))
        .where(
          productLedgerDateRangeCondition(
            ledger.transactionDate,
            reqDto.startDate,
            reqDto.endDate,
          ),
        )
        .orderBy(
          desc(ledger.transactionDate),
          desc(ledger.createdAt),
          desc(ledger.id),
        )
        .limit(reqDto.limit)
        .offset(reqDto.offset),
      // Đếm thẳng trên `inventory_transactions` với cùng điều kiện, không qua `ledger` — không cần
      // window function chỉ để đếm dòng.
      this.db
        .select({ total: count() })
        .from(inventoryTransactions)
        .where(
          and(
            eq(inventoryTransactions.itemId, itemId),
            reqDto.warehouseId
              ? eq(inventoryTransactions.warehouseId, reqDto.warehouseId)
              : undefined,
            productLedgerDateRangeCondition(
              inventoryTransactions.transactionDate,
              reqDto.startDate,
              reqDto.endDate,
            ),
          ),
        ),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(ProductLedgerEntryResDto, rows, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(countRows[0]?.total ?? 0, reqDto),
    );
  }

  private async ensureFinishedGoodExists(itemId: string): Promise<void> {
    const [existing] = await this.db
      .select({ id: items.id })
      .from(items)
      .where(
        and(
          eq(items.id, itemId),
          isNull(items.deletedAt),
          eq(items.type, ItemType.FG),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new AppException(ErrorCode.E007, HttpStatus.NOT_FOUND);
    }
  }
}
