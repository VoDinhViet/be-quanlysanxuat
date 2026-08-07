import { HttpStatus, Inject, Injectable } from '@nestjs/common';
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
  lte,
  or,
} from 'drizzle-orm';

import { OffsetPaginationDto } from '../../common/dto/offset-pagination/offset-pagination.dto';
import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { unaccentILike } from '../../common/utils/search.util';
import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import type { Database, DbTransaction } from '../../database/database.type';
import {
  clients,
  items as itemsTable,
  orderItems,
  OrderItemStatus,
  orders,
  OrderStatus,
  productionOrderItems,
  productionOrderLogs,
  ProductionOrderLogAction,
  productionOrders,
  ProductionOrderStatus,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { InventoryService } from '../inventory/inventory.service';
import { ProductionJobsService } from '../production-jobs/production-jobs.service';
import { GetProductionOrderLogsReqDto } from './dto/get-production-order-logs.req.dto';
import { GetProductionOrdersReqDto } from './dto/get-production-orders.req.dto';
import { ProductionOrderDetailResDto } from './dto/production-order-detail.res.dto';
import { ProductionOrderLogResDto } from './dto/production-order-log.res.dto';
import { ProductionOrderResDto } from './dto/production-order.res.dto';
import { UpdateProductionOrderReqDto } from './dto/update-production-order.req.dto';

/** Số liệu đã chốt/tính toán của một dòng PO — hình dạng chung cho mọi hàm đọc/ghi bên dưới. */
interface PlanItem {
  orderItemId: string;
  itemId: string;
  quantity: number;
  orderQty: number;
  onHandQty: number;
  availableQty: number;
  fromStockQty: number;
}

/** "LSX" — lập kế hoạch sản xuất cho một PO đã duyệt: `production_orders` (header, 1 đơn = 1 LSX)
 * + `production_order_items` (quyết định sản xuất, 1 dòng/dòng PO). Vòng đời, business rule, luồng
 * ghi log: `docs/domains/production.md`, `docs/workflows/production-order-approval.md`. */
@Injectable()
export class ProductionOrdersService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly inventoryService: InventoryService,
    private readonly productionJobsService: ProductionJobsService,
  ) {}

  async getProductionOrders(
    reqDto: GetProductionOrdersReqDto,
  ): Promise<OffsetPaginatedDto<ProductionOrderResDto>> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;
    // production_orders là base table (không phải orders) — mỗi PO trong phạm vi LSX luôn có đúng
    // 1 header (OrdersService.approveOrder seed sẵn), nên inner join không bỏ sót PO nào.
    const where = and(
      isNull(orders.deletedAt),
      keyword
        ? or(
            unaccentILike(orders.code, keyword),
            unaccentILike(productionOrders.code, keyword),
          )
        : undefined,
      reqDto.clientId ? eq(orders.clientId, reqDto.clientId) : undefined,
      reqDto.fromDate ? gte(orders.dueDate, reqDto.fromDate) : undefined,
      reqDto.toDate ? lte(orders.dueDate, reqDto.toDate) : undefined,
      reqDto.status ? eq(productionOrders.status, reqDto.status) : undefined,
    );

    const [entities, countRows] = await Promise.all([
      this.db
        .select({
          id: productionOrders.id,
          code: productionOrders.code,
          orderId: orders.id,
          orderCode: orders.code,
          orderDate: orders.orderDate,
          dueDate: orders.dueDate,
          note: orders.note,
          client: getTableColumns(clients),
          status: productionOrders.status,
        })
        .from(productionOrders)
        .innerJoin(orders, eq(orders.id, productionOrders.orderId))
        .leftJoin(clients, eq(clients.id, orders.clientId))
        .where(where)
        .orderBy(asc(orders.dueDate), desc(orders.createdAt))
        .limit(reqDto.limit)
        .offset(reqDto.offset),
      this.db
        .select({ total: count() })
        .from(productionOrders)
        .innerJoin(orders, eq(orders.id, productionOrders.orderId))
        .where(where),
    ]);

    const rows = entities.map((row) => ({
      ...row,
      client: row.client?.id ? row.client : null,
    }));

    return new OffsetPaginatedDto(
      plainToInstance(ProductionOrderResDto, rows, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(countRows[0]?.total ?? 0, reqDto),
    );
  }

  /** Snapshot dòng quyết định sản xuất đã ghi lúc duyệt PO — query thẳng trên `production_orders`
   * (khoá theo `id` của nó, không qua `orders`), không tính lại live qua `InventoryService`. */
  async getProductionOrdersById(
    productionOrdersId: string,
  ): Promise<ProductionOrderDetailResDto> {
    const productionOrder = await this.db.query.productionOrders.findFirst({
      where: eq(productionOrders.id, productionOrdersId),
      with: {
        order: { with: { client: true } },
        items: {
          with: { item: { with: { unit: true, imageFile: true } } },
        },
      },
    });
    if (!productionOrder) {
      throw new AppException(ErrorCode.E081, HttpStatus.NOT_FOUND);
    }

    return plainToInstance(ProductionOrderDetailResDto, productionOrder, {
      excludeExtraneousValues: true,
    });
  }

  /** Sửa số lượng sản xuất từng dòng, nhập tay — chỉ khi LSX còn `PENDING` (`E084`). Partial: chỉ
   * dòng gửi lên bị ghi, dòng khác giữ nguyên. Chỉ tính lại `fromStockQty` — không refresh tồn kho
   * (`docs/workflows/production-order-approval.md`). */
  async updateProductionOrder(
    productionOrdersId: string,
    reqDto: UpdateProductionOrderReqDto,
    userId: string,
  ): Promise<ProductionOrderDetailResDto> {
    const productionOrder = await this.db.query.productionOrders.findFirst({
      columns: { id: true, status: true },
      where: eq(productionOrders.id, productionOrdersId),
      with: {
        order: { columns: { deletedAt: true } },
        items: {
          columns: {
            id: true,
            orderItemId: true,
            orderQty: true,
            quantity: true,
            itemId: true,
          },
        },
      },
    });
    if (!productionOrder) {
      throw new AppException(ErrorCode.E081, HttpStatus.NOT_FOUND);
    }
    // `orderId` là FK bắt buộc, đúng 1 dòng — Drizzle suy sai kiểu `order` thành one|many sau khi
    // schema có thêm nhiều quan hệ trỏ `users`, ép lại cho đúng thực tế thay vì đổi logic.
    const order = productionOrder.order as { deletedAt: Date | null };
    if (order.deletedAt) {
      throw new AppException(ErrorCode.E057, HttpStatus.NOT_FOUND);
    }
    if (productionOrder.status !== ProductionOrderStatus.PENDING) {
      throw new AppException(ErrorCode.E084, HttpStatus.CONFLICT);
    }

    const rowByOrderItemId = new Map(
      productionOrder.items.map((row) => [row.orderItemId, row]),
    );
    const updates = reqDto.items.map((item) => {
      const row = rowByOrderItemId.get(item.orderItemId);
      if (!row) {
        throw new AppException(ErrorCode.E078, HttpStatus.BAD_REQUEST);
      }
      return {
        id: row.id,
        itemId: row.itemId,
        oldQuantity: row.quantity,
        quantity: item.quantity,
        fromStockQty: Math.max(0, row.orderQty - item.quantity),
      };
    });

    if (updates.length) {
      // Tên item chỉ để dựng nội dung log — 1 query gộp theo itemId duy nhất, không lặp theo dòng.
      const itemIds = [...new Set(updates.map((update) => update.itemId))];
      const itemRows = await this.db
        .select({ id: itemsTable.id, name: itemsTable.name })
        .from(itemsTable)
        .where(inArray(itemsTable.id, itemIds));
      const nameByItemId = new Map(
        itemRows.map((item) => [item.id, item.name]),
      );
      const content = `Cập nhật SL sản xuất: ${updates
        .map(
          (update) =>
            `${nameByItemId.get(update.itemId) ?? update.itemId} ${update.oldQuantity} → ${update.quantity}`,
        )
        .join('; ')}`;

      await this.db.transaction(async (tx) => {
        for (const update of updates) {
          await tx
            .update(productionOrderItems)
            .set({
              quantity: update.quantity,
              fromStockQty: update.fromStockQty,
            })
            .where(eq(productionOrderItems.id, update.id));
        }
        await this.logAction(
          tx,
          productionOrdersId,
          ProductionOrderLogAction.QUANTITY_UPDATED,
          content,
          userId,
        );
      });
    }

    return this.getProductionOrdersById(productionOrdersId);
  }

  /** Chỉ hợp lệ khi đang `PENDING` và PO gốc vẫn `AWAITING_PRODUCTION`. Trong cùng transaction:
   * chốt mã `LSXxxxx`, đẩy PO gốc sang `IN_PROGRESS`, sinh Job. Không lập phiếu xuất kho, không
   * kiểm tồn kho tổng hợp trước duyệt (`docs/domains/production.md`, mục Invariants). */
  async approveProductionOrder(
    productionOrdersId: string,
    userId: string,
  ): Promise<ProductionOrderDetailResDto> {
    const [productionOrder] = await this.db
      .select({
        id: productionOrders.id,
        orderId: productionOrders.orderId,
        status: productionOrders.status,
        orderStatus: orders.status,
        orderDeletedAt: orders.deletedAt,
      })
      .from(productionOrders)
      .innerJoin(orders, eq(orders.id, productionOrders.orderId))
      .where(eq(productionOrders.id, productionOrdersId));
    if (!productionOrder) {
      throw new AppException(ErrorCode.E081, HttpStatus.NOT_FOUND);
    }
    if (productionOrder.orderDeletedAt) {
      throw new AppException(ErrorCode.E057, HttpStatus.NOT_FOUND);
    }
    if (productionOrder.status !== ProductionOrderStatus.PENDING) {
      throw new AppException(ErrorCode.E083, HttpStatus.CONFLICT);
    }
    if (productionOrder.orderStatus !== OrderStatus.AWAITING_PRODUCTION) {
      throw new AppException(ErrorCode.E076, HttpStatus.CONFLICT);
    }

    // Gộp SL theo item cho Job — chỉ giữ SL > 0 (khớp `chk_production_jobs_quantity`), theo số
    // liệu đã lưu (kể cả đã sửa tay qua `updateProductionOrder`).
    const planRows = await this.db
      .select({
        itemId: productionOrderItems.itemId,
        quantity: productionOrderItems.quantity,
      })
      .from(productionOrderItems)
      .where(eq(productionOrderItems.productionOrderId, productionOrdersId));
    const quantityByItem = new Map<string, number>();
    for (const row of planRows) {
      if (row.quantity > 0) {
        quantityByItem.set(
          row.itemId,
          (quantityByItem.get(row.itemId) ?? 0) + row.quantity,
        );
      }
    }

    await this.db.transaction(async (tx) => {
      const code = await this.generateProductionOrderCode(tx);
      await tx
        .update(productionOrders)
        .set({
          status: ProductionOrderStatus.APPROVED,
          code,
          approvedBy: userId,
          approvedAt: new Date(),
        })
        .where(eq(productionOrders.id, productionOrdersId));
      await tx
        .update(orders)
        .set({ status: OrderStatus.IN_PROGRESS })
        .where(eq(orders.id, productionOrder.orderId));
      await this.productionJobsService.createJobs(
        tx,
        productionOrdersId,
        quantityByItem,
      );

      const jobCount = quantityByItem.size;
      const content =
        jobCount > 0
          ? `Duyệt LSX ${code}, sinh ${jobCount} Job`
          : `Duyệt LSX ${code}`;
      await this.logAction(
        tx,
        productionOrdersId,
        ProductionOrderLogAction.APPROVED,
        content,
        userId,
      );
    });

    return this.getProductionOrdersById(productionOrdersId);
  }

  /** Khuôn `OrdersService.generateOrderCode`/`ItemsService.generateItemCode` — vẫn TOCTOU như mọi
   * generator khác trong repo, unique constraint trên `code` là chốt chặn thật. */
  private async generateProductionOrderCode(
    tx: DbTransaction,
  ): Promise<string> {
    const [totalRows] = await tx
      .select({ total: count() })
      .from(productionOrders)
      .where(eq(productionOrders.status, ProductionOrderStatus.APPROVED));
    return `LSX${String((totalRows?.total ?? 0) + 1).padStart(4, '0')}`;
  }

  /** Đề xuất SX ban đầu cho mọi dòng NORMAL của một PO, tại thời điểm duyệt — công thức ở
   * `docs/domains/production.md` (loại trừ chính đơn này qua `excludeOrderId`). Chỉ đọc — gọi
   * trước khi `OrdersService.approveOrder` mở transaction rồi mới `seedPlan`. */
  async getInitialPlanItems(orderId: string): Promise<PlanItem[]> {
    // Nguồn: mọi dòng PO status = NORMAL của đơn này — dòng CANCELLED không cần sản xuất.
    const normalOrderItems = await this.db
      .select({
        id: orderItems.id,
        itemId: orderItems.itemId,
        quantity: orderItems.quantity,
      })
      .from(orderItems)
      .where(
        and(
          eq(orderItems.orderId, orderId),
          eq(orderItems.status, OrderItemStatus.NORMAL),
        ),
      );
    // Không có dòng NORMAL nào thì không có gì để tính — thoát sớm, khỏi gọi InventoryService dư.
    if (!normalOrderItems.length) {
      return [];
    }

    // Gom itemId duy nhất — 1 query tồn kho cho mọi item thay vì mỗi dòng PO một query.
    const itemIds = [...new Set(normalOrderItems.map((item) => item.itemId))];
    // `excludeOrderId = orderId`: PO đang xét đã tự giữ chỗ trong `reserved`, phải loại trừ chính
    // nó ra để không bị trừ nhu cầu của nó hai lần (xem docs/domains/production.md).
    const stockByItem = await this.inventoryService.getStockLevels(
      itemIds,
      orderId,
    );

    return normalOrderItems.map((item) => {
      // Item chưa từng có phiếu kho nào → coi như tồn 0, không phải lỗi.
      const stock = stockByItem.get(item.itemId) ?? {
        onHand: 0,
        reserved: 0,
      };
      // Khả dụng = Tồn TP − đã giữ chỗ (của các đơn khác).
      const available = stock.onHand - stock.reserved;
      // Đề xuất SX: Khả dụng đủ thì chỉ SX phần thiếu; Khả dụng âm (đã hụt sẵn) thì SX đủ cả SL PO.
      const suggested =
        available >= 0 ? Math.max(0, item.quantity - available) : item.quantity;

      return {
        orderItemId: item.id,
        itemId: item.itemId,
        quantity: suggested,
        orderQty: item.quantity,
        onHandQty: stock.onHand,
        availableQty: available,
        // Lấy từ tồn: phần SL PO không nằm trong Đề xuất SX, coi như đáp ứng bằng tồn có sẵn.
        fromStockQty: Math.max(0, item.quantity - suggested),
      };
    });
  }

  /** Ghi header (`PENDING`) + các dòng quyết định sản xuất — replace-all theo `orderId`, nên duyệt
   * lại một PO từng bị từ chối sẽ ghi đè kế hoạch cũ, không đụng unique constraint. Bắt buộc
   * truyền `tx` — chỉ chạy được trong transaction đang mở của `OrdersService.approveOrder`. */
  async seedPlan(
    tx: DbTransaction,
    orderId: string,
    items: PlanItem[],
    userId: string,
  ): Promise<void> {
    await tx
      .delete(productionOrders)
      .where(eq(productionOrders.orderId, orderId));

    const [createdProductionOrders] = await tx
      .insert(productionOrders)
      .values({ orderId, createdBy: userId })
      .returning({ id: productionOrders.id });

    if (items.length) {
      await tx.insert(productionOrderItems).values(
        items.map((item) => ({
          productionOrderId: createdProductionOrders.id,
          orderItemId: item.orderItemId,
          itemId: item.itemId,
          quantity: item.quantity,
          orderQty: item.orderQty,
          onHandQty: item.onHandQty,
          availableQty: item.availableQty,
          fromStockQty: item.fromStockQty,
        })),
      );
    }

    await this.logAction(
      tx,
      createdProductionOrders.id,
      ProductionOrderLogAction.CREATED,
      `Tạo LSX (${items.length} dòng quyết định sản xuất)`,
      userId,
    );
  }

  /** `performer` null nếu credential đã bị xoá; `E081` nếu header không tồn tại. */
  async getProductionOrderLogs(
    productionOrdersId: string,
    reqDto: GetProductionOrderLogsReqDto,
  ): Promise<OffsetPaginatedDto<ProductionOrderLogResDto>> {
    const exists = await this.db.query.productionOrders.findFirst({
      columns: { id: true },
      where: eq(productionOrders.id, productionOrdersId),
    });
    if (!exists) {
      throw new AppException(ErrorCode.E081, HttpStatus.NOT_FOUND);
    }

    const where = eq(productionOrderLogs.productionOrderId, productionOrdersId);
    const [rows, countRows] = await Promise.all([
      this.db.query.productionOrderLogs.findMany({
        where,
        with: { performer: true },
        orderBy: desc(productionOrderLogs.createdAt),
        limit: reqDto.limit,
        offset: reqDto.offset,
      }),
      this.db.select({ total: count() }).from(productionOrderLogs).where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(ProductionOrderLogResDto, rows, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(countRows[0]?.total ?? 0, reqDto),
    );
  }

  /** Ghi 1 dòng lịch sử thao tác — luôn gọi trong transaction của hành động đang log, không tách
   * rời (log và hành động cùng commit hoặc cùng rollback). */
  private async logAction(
    tx: DbTransaction,
    productionOrderId: string,
    action: ProductionOrderLogAction,
    content: string,
    userId: string,
  ): Promise<void> {
    await tx.insert(productionOrderLogs).values({
      productionOrderId,
      action,
      // Phòng vượt varchar(1000) — Postgres throw thay vì tự cắt bớt.
      content: content.slice(0, 1000),
      performedBy: userId,
    });
  }
}
