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
  InventoryItemType,
  materialGroups,
  materials,
  MaterialStatus,
  orderItems,
  orders,
  OrderItemStatus,
  OrderStatus,
  products,
  ProductStatus,
  ProductType,
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

  /** Liệt kê mọi FG ACTIVE, kể cả sản phẩm chưa từng có phiếu nào — không chỉ sản phẩm có phát
   * sinh kho. Phân trang/lọc chạy trên `products`, `onHand`/`reserved` chỉ tra cho trang hiện tại. */
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
      undefined,
      reqDto.warehouseId,
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

  /** Không thể phân trang trên `materials` rồi tra tồn riêng như `getInventory` — filter `status`
   * (giá trị tính, không phải cột thật) phải chạy trong `WHERE`, nên toàn bộ join + tính toán nằm
   * trong một `.select()` duy nhất, dùng chung `where` cho cả trang lẫn `count()`. */
  async getMaterialInventory(
    reqDto: GetMaterialInventoryReqDto,
  ): Promise<OffsetPaginatedDto<MaterialInventoryItemResDto>> {
    const stock = this.materialOnHandSubquery(
      reqDto.asOfDate,
      reqDto.warehouseId,
    );
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;

    const onHandSql = () => sql<number>`coalesce(${stock.onHand}, 0)`;
    // Literal `0` — đợt nổ BOM đa cấp sau này chỉ cần thay hàm này bằng subquery thật, công thức
    // `available`/`status` không phải sửa.
    const bomDemandSql = () => sql<number>`0`;
    const availableSql = () =>
      sql<number>`(${onHandSql()}) - (${bomDemandSql()})`;

    const where = and(
      eq(materials.status, MaterialStatus.ACTIVE),
      keyword
        ? or(
            unaccentILike(materials.code, keyword),
            unaccentILike(materials.name, keyword),
          )
        : undefined,
      reqDto.materialGroupId
        ? eq(materials.materialGroupId, reqDto.materialGroupId)
        : undefined,
      reqDto.type ? eq(materials.type, reqDto.type) : undefined,
      reqDto.supplierId
        ? eq(materials.supplierId, reqDto.supplierId)
        : undefined,
      reqDto.status
        ? this.materialStatusCondition(availableSql, reqDto.status)
        : undefined,
    );

    const [rows, countRows] = await Promise.all([
      this.db
        .select({
          id: materials.id,
          code: materials.code,
          name: materials.name,
          type: materials.type,
          unit: getTableColumns(units),
          group: getTableColumns(materialGroups),
          supplier: getTableColumns(suppliers),
          image: getTableColumns(files),
          minStock: materials.minStock,
          onHand: onHandSql().mapWith(Number).as('on_hand'),
          reserved: sql<number>`0`.mapWith(Number).as('reserved'),
          issuable: onHandSql().mapWith(Number).as('issuable'),
          bomDemand: bomDemandSql().mapWith(Number).as('bom_demand'),
          available: availableSql().mapWith(Number).as('available'),
        })
        .from(materials)
        .innerJoin(units, eq(units.id, materials.unitId))
        .innerJoin(
          materialGroups,
          eq(materialGroups.id, materials.materialGroupId),
        )
        .leftJoin(suppliers, eq(suppliers.id, materials.supplierId))
        .leftJoin(files, eq(files.id, materials.imageFileId))
        .leftJoin(stock, eq(stock.materialId, materials.id))
        .where(where)
        .orderBy(asc(materials.code))
        .limit(reqDto.limit)
        .offset(reqDto.offset),
      this.db
        .select({ total: count() })
        .from(materials)
        .leftJoin(stock, eq(stock.materialId, materials.id))
        .where(where),
    ]);

    const items = rows.map((row) => ({
      ...row,
      status: this.materialStockStatus(row.available, row.minStock),
    }));

    return new OffsetPaginatedDto(
      plainToInstance(MaterialInventoryItemResDto, items, {
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
        ? eq(inventoryBalances.itemType, reqDto.itemType)
        : undefined,
    );

    const [entities, countRows] = await Promise.all([
      this.db.query.inventoryBalances.findMany({
        where,
        limit: reqDto.limit,
        offset: reqDto.offset,
        orderBy: desc(inventoryBalances.updatedAt),
        with: { warehouse: true, product: true, material: true },
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
        ? eq(inventoryTransactions.itemType, reqDto.itemType)
        : undefined,
      reqDto.productId
        ? eq(inventoryTransactions.productId, reqDto.productId)
        : undefined,
      reqDto.materialId
        ? eq(inventoryTransactions.materialId, reqDto.materialId)
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
        with: { warehouse: true, product: true, material: true, creator: true },
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
        return sql`(${availableSql()}) >= 0 and (${availableSql()}) < ${materials.minStock}`;
      case MaterialStockStatus.NORMAL:
        return sql`(${availableSql()}) >= ${materials.minStock}`;
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

  /** `asOfDate` không đọc `inventory_balances` được (bảng đó là tồn hiện tại) — cộng lại từ
   * `inventory_transactions` với `transactionDate <= asOfDate`. Không truyền thì đọc balances. */
  private materialOnHandSubquery(asOfDate?: Date, warehouseId?: string) {
    if (asOfDate) {
      return this.db
        .select({
          materialId: inventoryTransactions.materialId,
          onHand: sql<number>`sum(${inventoryTransactions.quantity})`
            .mapWith(Number)
            .as('on_hand'),
        })
        .from(inventoryTransactions)
        .where(
          and(
            eq(inventoryTransactions.itemType, InventoryItemType.MATERIAL),
            lte(inventoryTransactions.transactionDate, asOfDate),
            warehouseId
              ? eq(inventoryTransactions.warehouseId, warehouseId)
              : undefined,
          ),
        )
        .groupBy(inventoryTransactions.materialId)
        .as('material_on_hand');
    }

    return this.materialBalanceSubquery(warehouseId);
  }

  /** `excludeOrderId` loại một đơn khỏi `reserved` khi tính Khả dụng cho chính đơn đó — đơn này đã
   * tự giữ chỗ nên không loại trừ sẽ bị trừ nhu cầu của nó hai lần. Chỉ `ProductionOrdersService`
   * truyền tham số này; `GET /inventory` luôn để trống. `warehouseId` gộp mọi kho nếu bỏ trống. */
  async getStockLevels(
    productIds: string[],
    excludeOrderId?: string,
    warehouseId?: string,
  ): Promise<Map<string, { onHand: number; reserved: number }>> {
    if (!productIds.length) {
      return new Map();
    }

    const balance = this.productBalanceSubquery(warehouseId);
    const reserved = this.reservedSubquery(excludeOrderId);

    const rows = await this.db
      .select({
        productId: products.id,
        onHand: sql<number>`coalesce(${balance.onHand}, 0)`.mapWith(Number),
        reserved: sql<number>`coalesce(${reserved.reserved}, 0)`.mapWith(
          Number,
        ),
      })
      .from(products)
      .leftJoin(balance, eq(balance.productId, products.id))
      .leftJoin(reserved, eq(reserved.productId, products.id))
      .where(inArray(products.id, productIds));

    return new Map(
      rows.map((row) => [
        row.productId,
        { onHand: row.onHand, reserved: row.reserved },
      ]),
    );
  }

  /** Per-material on-hand, gộp mọi kho trừ khi `warehouseId` được truyền. */
  async getMaterialStockLevels(
    materialIds: string[],
    warehouseId?: string,
  ): Promise<Map<string, number>> {
    if (!materialIds.length) {
      return new Map();
    }

    const balance = this.materialBalanceSubquery(warehouseId);

    const rows = await this.db
      .select({
        materialId: materials.id,
        onHand: sql<number>`coalesce(${balance.onHand}, 0)`.mapWith(Number),
      })
      .from(materials)
      .leftJoin(balance, eq(balance.materialId, materials.id))
      .where(inArray(materials.id, materialIds));

    return new Map(rows.map((row) => [row.materialId, row.onHand]));
  }

  private productBalanceSubquery(warehouseId?: string) {
    return this.db
      .select({
        productId: inventoryBalances.productId,
        onHand: sql<number>`sum(${inventoryBalances.quantity})`
          .mapWith(Number)
          .as('on_hand'),
      })
      .from(inventoryBalances)
      .where(
        and(
          eq(inventoryBalances.itemType, InventoryItemType.PRODUCT),
          warehouseId
            ? eq(inventoryBalances.warehouseId, warehouseId)
            : undefined,
        ),
      )
      .groupBy(inventoryBalances.productId)
      .as('product_balance');
  }

  private materialBalanceSubquery(warehouseId?: string) {
    return this.db
      .select({
        materialId: inventoryBalances.materialId,
        onHand: sql<number>`sum(${inventoryBalances.quantity})`
          .mapWith(Number)
          .as('on_hand'),
      })
      .from(inventoryBalances)
      .where(
        and(
          eq(inventoryBalances.itemType, InventoryItemType.MATERIAL),
          warehouseId
            ? eq(inventoryBalances.warehouseId, warehouseId)
            : undefined,
        ),
      )
      .groupBy(inventoryBalances.materialId)
      .as('material_balance');
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

  /** Với mỗi sản phẩm, phần nhu cầu đơn đang mở chưa giao. "Mở" nghĩa là đã qua cổng duyệt
   * (`AWAITING_PRODUCTION`/`IN_PROGRESS`) — đơn `DRAFT`/`PENDING_CONFIRMATION` chưa được Giám đốc
   * duyệt nên chưa giữ chỗ tồn. `excludeOrderId` xem `getStockLevels`. */
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
