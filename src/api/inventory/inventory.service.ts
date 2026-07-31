import { Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import {
  and,
  asc,
  count,
  eq,
  getTableColumns,
  inArray,
  isNull,
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
  stockReceiptItems,
  stockReceipts,
  StockReceiptType,
  suppliers,
  units,
} from '../../database/schemas';
import { GetInventoryReqDto } from './dto/get-inventory.req.dto';
import { GetMaterialInventoryReqDto } from './dto/get-material-inventory.req.dto';
import { InventoryItemResDto } from './dto/inventory-item.res.dto';
import { MaterialInventoryItemResDto } from './dto/material-inventory-item.res.dto';
import { MaterialStockStatus } from './inventory.constant';

/** Đọc tồn thành phẩm, không lưu gì — mọi số tính lúc đọc từ `stock_receipt_items` (sổ
 * `StockReceiptsService` ghi) và `order_items`, nên không bao giờ lệch nguồn. */
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
    const stock = this.materialStockSubquery(reqDto.asOfDate);
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

  /** Tồn ròng theo vật tư qua mọi phiếu chưa xoá có `materialId` (dòng thành phẩm để null, gộp
   * vào một bucket NULL không bao giờ join tới). `asOfDate` tính tồn tại thời điểm 23:59 ngày đó —
   * chỉ gộp phiếu có `receiptDate <= asOfDate`. */
  private materialStockSubquery(asOfDate?: Date) {
    return this.db
      .select({
        materialId: stockReceiptItems.materialId,
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
      .where(
        and(
          isNull(stockReceipts.deletedAt),
          asOfDate ? lte(stockReceipts.receiptDate, asOfDate) : undefined,
        ),
      )
      .groupBy(stockReceiptItems.materialId)
      .as('material_stock');
  }

  /** `excludeOrderId` loại một đơn khỏi `reserved` khi tính Khả dụng cho chính đơn đó — đơn này đã
   * tự giữ chỗ nên không loại trừ sẽ bị trừ nhu cầu của nó hai lần. Chỉ `ProductionOrdersService`
   * truyền tham số này; `GET /inventory` luôn để trống. Công thức đầy đủ:
   * `docs/workflows/production-order-approval.md`. */
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

  /** Tồn ròng theo sản phẩm qua mọi phiếu chưa xoá: IN cộng, OUT trừ. */
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

  /** Mỗi dòng đơn hàng đã thực xuất kho bao nhiêu (chỉ tính phiếu OUT). */
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
