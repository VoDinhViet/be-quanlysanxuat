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
  orderItems,
  OrderItemStatus,
  orders,
  OrderStatus,
  productionOrderItems,
  productionOrders,
  ProductionOrderStatus,
  StockReceiptReason,
  stockReceipts,
  stockReceiptItems,
  StockReceiptType,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { InventoryService } from '../inventory/inventory.service';
import { ProductionJobsService } from '../production-jobs/production-jobs.service';
import { GetProductionOrdersReqDto } from './dto/get-production-orders.req.dto';
import { ProductionOrderDetailResDto } from './dto/production-order-detail.res.dto';
import { ProductionOrderResDto } from './dto/production-order.res.dto';
import { UpdateProductionOrderReqDto } from './dto/update-production-order.req.dto';

/** Số liệu đã chốt/tính toán của một dòng PO — hình dạng chung mà mọi hàm đọc/ghi bên dưới tính
 * ra, không phân biệt LSX đang `PENDING` hay `ISSUED`. */
interface ComputedLine {
  orderItemId: string;
  productId: string;
  quantity: number;
  orderQty: number;
  onHandQty: number;
  availableQty: number;
  fromStockQty: number;
}

const ORDERS_IN_SCOPE = [
  OrderStatus.AWAITING_PRODUCTION,
  OrderStatus.IN_PROGRESS,
];

/**
 * "LSX" — lập kế hoạch và phát hành sản xuất cho một PO đã duyệt. Hai tầng dữ liệu ở service này
 * (xem `src/database/schemas/production.ts` và `docs/features/production.md`):
 * - `production_orders` — header, **1 đơn hàng = 1 LSX** (`PENDING` = đang quyết định sản xuất,
 *   `ISSUED` = đã phát hành).
 * - `production_order_items` — phần con "quyết định sản xuất", 1 dòng cho mỗi dòng PO.
 *
 * Tầng thứ ba, **1 sản phẩm (FG) = 1 Job** (`production_jobs`, gộp mọi dòng cùng sản phẩm trong
 * LSX), sống ở module riêng `ProductionJobsService` — Job là một khái niệm/vòng đời khác ("Quản
 * lý sản xuất", đơn vị công việc thực tế của xưởng), chỉ được service này gọi sang qua `issueJobs`
 * trong transaction phát hành (`issueProductionOrders`), không tự quản lý ở đây.
 */
@Injectable()
export class ProductionOrdersService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly inventoryService: InventoryService,
    private readonly productionJobsService: ProductionJobsService,
  ) {}

  // ---------------------------------------------------------------------------------------------
  // Theo PO — màn hình chính LSX
  // ---------------------------------------------------------------------------------------------

  async getProductionOrders(
    reqDto: GetProductionOrdersReqDto,
  ): Promise<OffsetPaginatedDto<ProductionOrderResDto>> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;
    // `production_orders` là base table (không phải `orders`) — mỗi PO trong phạm vi LSX luôn có
    // đúng 1 header nhờ `OrdersService.approveOrder` seed sẵn, nên inner join không bỏ sót PO nào.
    const where = and(
      isNull(orders.deletedAt),
      inArray(orders.status, ORDERS_IN_SCOPE),
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

    const items = entities.map((row) => ({
      ...row,
      client: row.client?.id ? row.client : null,
    }));

    return new OffsetPaginatedDto(
      plainToInstance(ProductionOrderResDto, items, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(countRows[0]?.total ?? 0, reqDto),
    );
  }

  async getProductionOrderDetail(
    orderId: string,
  ): Promise<ProductionOrderDetailResDto> {
    const order = await this.ensureOrderInScope(orderId);
    const header = await this.getHeader(orderId);
    const lines = await this.computeCurrentLines(orderId);

    return plainToInstance(
      ProductionOrderDetailResDto,
      {
        code: header.code,
        orderId: order.id,
        orderCode: order.code,
        client: order.client,
        orderDate: order.orderDate,
        dueDate: order.dueDate,
        status: header.status,
        issuedAt: header.issuedAt,
        items: lines,
      },
      { excludeExtraneousValues: true },
    );
  }

  /**
   * Chỉ đọc: tính các dòng quyết định sản xuất ban đầu cho một PO tại thời điểm duyệt. Chạy
   * **trước** khi `OrdersService.approveOrder` mở transaction — `.claude/rules/api-module.md`
   * yêu cầu mọi kiểm tra/đọc phải chạy trước các lệnh ghi mà nó phục vụ.
   */
  async buildInitialItems(orderId: string): Promise<ComputedLine[]> {
    return this.computeCurrentLines(orderId);
  }

  /**
   * Ghi header (`PENDING`) + các dòng quyết định sản xuất — replace-all theo `orderId`, nên duyệt
   * lại một PO từng bị từ chối rồi gửi lại sẽ ghi đè kế hoạch cũ thay vì đụng constraint unique
   * trên `orderId`/`orderItemId`. Xoá header cascade dọn luôn `production_order_items` (và
   * `production_jobs`, dù ở nhánh `PENDING` không bao giờ có job). Bắt buộc truyền `tx` để hàm
   * này chỉ chạy được bên trong một transaction đang mở (của `OrdersService.approveOrder`, hoặc
   * của chính `updateProductionOrder` trong service này).
   */
  async seedPlan(
    tx: DbTransaction,
    orderId: string,
    items: ComputedLine[],
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
          productId: item.productId,
          quantity: item.quantity,
          orderQty: item.orderQty,
          onHandQty: item.onHandQty,
          availableQty: item.availableQty,
          fromStockQty: item.fromStockQty,
        })),
      );
    }
  }

  /** "Lưu lại" — replace-all các dòng quyết định sản xuất, đồng thời làm mới snapshot tồn kho của
   * từng dòng. */
  async updateProductionOrder(
    orderId: string,
    reqDto: UpdateProductionOrderReqDto,
    userId: string,
  ): Promise<ProductionOrderDetailResDto> {
    await this.ensureOrderInScope(orderId);
    await this.ensureNotIssued(orderId);

    const normalItems = await this.getNormalOrderItems(orderId);
    const normalItemIds = new Set(normalItems.map((item) => item.id));
    for (const item of reqDto.items) {
      if (!normalItemIds.has(item.orderItemId)) {
        throw new AppException(ErrorCode.E078, HttpStatus.BAD_REQUEST);
      }
    }

    const quantityByOrderItemId = new Map(
      reqDto.items.map((item) => [item.orderItemId, item.quantity]),
    );
    const lines = await this.computeLines(
      orderId,
      normalItems,
      quantityByOrderItemId,
    );

    await this.db.transaction(async (tx) => {
      await this.seedPlan(tx, orderId, lines, userId);
    });

    return this.getProductionOrderDetail(orderId);
  }

  /**
   * "Tạo LSX" — phát hành: chốt lại toàn bộ dòng quyết định sản xuất (kể cả dòng SL = 0, giữ làm
   * hồ sơ), gộp SL theo `productId` để sinh **1 Job cho mỗi sản phẩm** có SL > 0 (mã `JOBxxxx`
   * riêng), lập **một** phiếu xuất kho `OUT`/`DELIVERY` gộp cho cả lượt nếu có "Lấy từ tồn", và
   * chuyển đơn sang `IN_PROGRESS`. Xem `docs/features/production.md`.
   */
  async issueProductionOrders(
    orderId: string,
    userId: string,
  ): Promise<ProductionOrderDetailResDto> {
    const order = await this.ensureOrderInScope(orderId);
    await this.ensureNotIssued(orderId);

    const normalItems = await this.getNormalOrderItems(orderId);
    if (!normalItems.length) {
      throw new AppException(ErrorCode.E079, HttpStatus.BAD_REQUEST);
    }

    const header = await this.findHeader(orderId);
    const saved = header
      ? await this.db.query.productionOrderItems.findMany({
          columns: { orderItemId: true, quantity: true },
          where: eq(productionOrderItems.productionOrderId, header.id),
        })
      : [];
    const quantityByOrderItemId = new Map(
      saved.map((row) => [row.orderItemId, row.quantity]),
    );
    const lines = await this.computeLines(
      orderId,
      normalItems,
      quantityByOrderItemId,
    );

    // Từ chối cả lượt phát hành nếu hai dòng PO cùng sản phẩm cộng lại xin nhiều tồn hơn thực tế
    // đang có — công thức tính từng dòng riêng lẻ không tự bắt được ca này, vì mỗi dòng tính độc
    // lập trên cùng một con số "Khả dụng" (xem docs/features/production.md).
    await this.ensureSufficientStockForIssue(lines);

    const totalFromStock = lines.reduce(
      (sum, line) => sum + line.fromStockQty,
      0,
    );
    const quantityByProduct = new Map<string, number>();
    for (const line of lines) {
      if (line.quantity > 0) {
        quantityByProduct.set(
          line.productId,
          (quantityByProduct.get(line.productId) ?? 0) + line.quantity,
        );
      }
    }

    await this.db.transaction(async (tx) => {
      // Mọi dòng hiện có của đơn này đều đang `PENDING` (đã đảm bảo bởi `ensureNotIssued` ở trên)
      // — xoá header cũ (cascade dọn items) và thay bằng header + bộ dòng cuối cùng.
      await tx
        .delete(productionOrders)
        .where(eq(productionOrders.orderId, orderId));

      const code = await this.generateProductionOrderCode(tx);
      const issuedAt = new Date();
      const [createdProductionOrders] = await tx
        .insert(productionOrders)
        .values({
          orderId,
          code,
          status: ProductionOrderStatus.ISSUED,
          issuedBy: userId,
          issuedAt,
          createdBy: userId,
        })
        .returning({ id: productionOrders.id });

      await tx.insert(productionOrderItems).values(
        lines.map((line) => ({
          productionOrderId: createdProductionOrders.id,
          orderItemId: line.orderItemId,
          productId: line.productId,
          quantity: line.quantity,
          orderQty: line.orderQty,
          onHandQty: line.onHandQty,
          availableQty: line.availableQty,
          fromStockQty: line.fromStockQty,
        })),
      );

      await this.productionJobsService.issueJobs(
        tx,
        createdProductionOrders.id,
        quantityByProduct,
      );

      if (totalFromStock > 0) {
        await this.createDeliveryReceipt(tx, order.code, lines);
      }

      await tx
        .update(orders)
        .set({ status: OrderStatus.IN_PROGRESS })
        .where(eq(orders.id, orderId));
    });

    return this.getProductionOrderDetail(orderId);
  }

  // ---------------------------------------------------------------------------------------------
  // Helper dùng chung
  // ---------------------------------------------------------------------------------------------

  /** Một phiếu xuất kho `OUT`/`DELIVERY` duy nhất cho cả lượt phát hành — không phải mỗi Job một
   * phiếu. Ghi trực tiếp qua `stockReceipts`/`stockReceiptItems` (không qua `StockReceiptsService`
   * — hàm đó tự mở transaction riêng và validate một DTO người dùng gõ tay, trong khi ở đây dòng
   * phiếu do server tự dựng từ dữ liệu PO đã qua kiểm, xem `docs/features/production.md`). */
  private async createDeliveryReceipt(
    tx: DbTransaction,
    orderCode: string,
    lines: ComputedLine[],
  ): Promise<void> {
    const code = await this.generateReceiptCode(tx);
    const [receipt] = await tx
      .insert(stockReceipts)
      .values({
        code,
        type: StockReceiptType.OUT,
        reason: StockReceiptReason.DELIVERY,
        receiptDate: new Date(),
        note: `Xuất kho theo LSX phát hành cho đơn hàng ${orderCode}`,
      })
      .returning({ id: stockReceipts.id });

    const toDeliver = lines.filter((line) => line.fromStockQty > 0);
    await tx.insert(stockReceiptItems).values(
      toDeliver.map((line) => ({
        receiptId: receipt.id,
        productId: line.productId,
        quantity: line.fromStockQty,
        orderItemId: line.orderItemId,
      })),
    );
  }

  private async generateReceiptCode(tx: DbTransaction): Promise<string> {
    const [totalRows] = await tx
      .select({ total: count() })
      .from(stockReceipts)
      .where(eq(stockReceipts.type, StockReceiptType.OUT));
    return `PX${String((totalRows?.total ?? 0) + 1).padStart(4, '0')}`;
  }

  /** Chỉ đếm header `ISSUED` — không được để header `PENDING` của mọi PO đã duyệt làm tăng sai số
   * thứ tự mã LSX. */
  private async generateProductionOrderCode(
    tx: DbTransaction,
  ): Promise<string> {
    const [totalRows] = await tx
      .select({ total: count() })
      .from(productionOrders)
      .where(eq(productionOrders.status, ProductionOrderStatus.ISSUED));
    return `LSX${String((totalRows?.total ?? 0) + 1).padStart(4, '0')}`;
  }

  /** Từ chối cả lượt phát hành nếu, với bất kỳ sản phẩm nào, tổng "Lấy từ tồn" của mọi dòng trong
   * lượt này làm tồn về âm — cùng bất biến với `StockReceiptsService.ensureSufficientStock`, tái
   * dùng mã lỗi (`E071`). */
  private async ensureSufficientStockForIssue(
    lines: ComputedLine[],
  ): Promise<void> {
    const fromStockByProduct = new Map<string, number>();
    for (const line of lines) {
      fromStockByProduct.set(
        line.productId,
        (fromStockByProduct.get(line.productId) ?? 0) + line.fromStockQty,
      );
    }

    const productIds = [...fromStockByProduct.keys()];
    if (!productIds.length) {
      return;
    }

    const stockByProduct =
      await this.inventoryService.getStockLevels(productIds);
    for (const [productId, requested] of fromStockByProduct) {
      const onHand = stockByProduct.get(productId)?.onHand ?? 0;
      if (onHand - requested < 0) {
        throw new AppException(ErrorCode.E071, HttpStatus.CONFLICT);
      }
    }
  }

  /** Các dòng Tab2 theo trạng thái hiện tại, tính live — luôn tính lại onHand/available, không
   * bao giờ dùng snapshot cũ làm nguồn hiển thị (xem `docs/features/production.md`). Header có
   * thể chưa tồn tại (PO vừa duyệt trước khi backfill, hoặc edge case) — khi đó coi như chưa có
   * dòng nào được lưu, mọi dòng dùng thẳng Đề xuất SX hệ thống gợi ý. */
  private async computeCurrentLines(orderId: string): Promise<ComputedLine[]> {
    const normalItems = await this.getNormalOrderItems(orderId);
    if (!normalItems.length) {
      return [];
    }

    const header = await this.findHeader(orderId);
    const saved = header
      ? await this.db.query.productionOrderItems.findMany({
          columns: { orderItemId: true, quantity: true },
          where: eq(productionOrderItems.productionOrderId, header.id),
        })
      : [];
    const quantityByOrderItemId = new Map(
      saved.map((row) => [row.orderItemId, row.quantity]),
    );

    return this.computeLines(orderId, normalItems, quantityByOrderItemId);
  }

  /**
   * Áp dụng công thức ở `docs/features/production.md`: Khả dụng loại trừ chính nhu cầu của đơn
   * này (`excludeOrderId`), Đề xuất SX mặc định theo gợi ý hệ thống trừ khi `quantityByOrderItemId`
   * đã có sẵn giá trị đã chốt cho dòng đó.
   */
  private async computeLines(
    orderId: string,
    normalItems: { id: string; productId: string; quantity: number }[],
    quantityByOrderItemId: Map<string, number>,
  ): Promise<ComputedLine[]> {
    const productIds = [...new Set(normalItems.map((item) => item.productId))];
    const stockByProduct = await this.inventoryService.getStockLevels(
      productIds,
      orderId,
    );

    return normalItems.map((item) => {
      const stock = stockByProduct.get(item.productId) ?? {
        onHand: 0,
        reserved: 0,
      };
      const available = stock.onHand - stock.reserved;
      const suggested =
        available >= 0 ? Math.max(0, item.quantity - available) : item.quantity;
      const quantity = quantityByOrderItemId.get(item.id) ?? suggested;
      const fromStockQty = Math.max(0, item.quantity - quantity);

      return {
        orderItemId: item.id,
        productId: item.productId,
        quantity,
        orderQty: item.quantity,
        onHandQty: stock.onHand,
        availableQty: available,
        fromStockQty,
      };
    });
  }

  private async getNormalOrderItems(
    orderId: string,
  ): Promise<{ id: string; productId: string; quantity: number }[]> {
    return this.db.query.orderItems.findMany({
      columns: { id: true, productId: true, quantity: true },
      where: and(
        eq(orderItems.orderId, orderId),
        eq(orderItems.status, OrderItemStatus.NORMAL),
      ),
    });
  }

  private async ensureOrderInScope(orderId: string): Promise<{
    id: string;
    code: string;
    orderDate: Date;
    dueDate: Date | null;
    client: { id: string; code: string; name: string } | null;
  }> {
    const order = await this.db.query.orders.findFirst({
      columns: {
        id: true,
        code: true,
        status: true,
        orderDate: true,
        dueDate: true,
      },
      where: and(eq(orders.id, orderId), isNull(orders.deletedAt)),
      with: { client: true },
    });

    if (!order) {
      throw new AppException(ErrorCode.E057, HttpStatus.NOT_FOUND);
    }
    if (!ORDERS_IN_SCOPE.includes(order.status)) {
      throw new AppException(ErrorCode.E076, HttpStatus.CONFLICT);
    }

    return order;
  }

  private async findHeader(orderId: string): Promise<
    | {
        id: string;
        code: string | null;
        status: ProductionOrderStatus;
        issuedAt: Date | null;
      }
    | undefined
  > {
    return this.db.query.productionOrders.findFirst({
      columns: { id: true, code: true, status: true, issuedAt: true },
      where: eq(productionOrders.orderId, orderId),
    });
  }

  /** Giống `findHeader`, nhưng ném `E081` nếu header chưa tồn tại — dùng ở nơi bắt buộc phải có
   * header (đọc Tab1/Tab2), khác các nơi coi việc thiếu header là "chưa có dòng nào được lưu". */
  private async getHeader(orderId: string): Promise<{
    id: string;
    code: string | null;
    status: ProductionOrderStatus;
    issuedAt: Date | null;
  }> {
    const header = await this.findHeader(orderId);
    if (!header) {
      throw new AppException(ErrorCode.E081, HttpStatus.NOT_FOUND);
    }
    return header;
  }

  private async isIssued(orderId: string): Promise<boolean> {
    const header = await this.findHeader(orderId);
    return header?.status === ProductionOrderStatus.ISSUED;
  }

  private async ensureNotIssued(orderId: string): Promise<void> {
    if (await this.isIssued(orderId)) {
      throw new AppException(ErrorCode.E077, HttpStatus.CONFLICT);
    }
  }
}
