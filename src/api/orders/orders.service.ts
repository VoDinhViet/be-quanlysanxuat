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
  sql,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { OffsetPaginationDto } from '../../common/dto/offset-pagination/offset-pagination.dto';
import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import {
  DocumentType,
  generateDocumentSequence,
} from '../../common/utils/document-sequence.util';
import { unaccentILike } from '../../common/utils/search.util';
import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import type { Database, DbTransaction } from '../../database/database.type';
import {
  clients,
  Currency,
  files,
  orderFiles,
  orderItems,
  orderPayments,
  orders,
  OrderStatus,
  productionOrders,
  ProductionOrderStatus,
  items,
  units,
  users,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { FilesService } from '../files/files.service';
import { ProductionOrdersService } from '../production-orders/production-orders.service';
import { CreateOrderPaymentReqDto } from './dto/create-order-payment.req.dto';
import { CreateOrderReqDto } from './dto/create-order.req.dto';
import { GetOrdersReqDto } from './dto/get-orders.req.dto';
import { OrderItemReqDto } from './dto/order-item.req.dto';
import { OrderItemResDto } from './dto/order-item.res.dto';
import { OrderPaymentResDto } from './dto/order-payment.res.dto';
import { OrderResDto } from './dto/order.res.dto';
import { OrderStatsResDto } from './dto/order-stats.res.dto';
import { PageOrderResDto } from './dto/page-order.res.dto';
import { RejectOrderReqDto } from './dto/reject-order.req.dto';
import { UpdateOrderReqDto } from './dto/update-order.req.dto';
import { OrderPaymentStatus } from './orders.constant';
import {
  issuedQuantityByOrderItemIdSubquery,
  paidAmountByOrderIdSubquery,
} from './orders.query';

/** `.mapWith(Number)` biến SQL `null` thành `0` (`Number(null) === 0`) — sai cho % trend nghĩa là
 * "chưa có kỳ trước để so sánh". Dùng `.mapWith` này ở mọi biểu thức có thể thật sự trả `null`. */
function mapNullableNumber(value: unknown): number | null {
  return value === null ? null : Number(value);
}

/** Đơn hàng: `DRAFT` → ... → `AWAITING_PRODUCTION` (duyệt Giám đốc) → `IN_PROGRESS`. Vòng đời +
 * business rule đầy đủ: `docs/domains/orders.md`, `docs/workflows/order-approval.md`. */
@Injectable()
export class OrdersService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly filesService: FilesService,
    private readonly productionOrdersService: ProductionOrdersService,
  ) {}

  async getOrders(
    reqDto: GetOrdersReqDto,
  ): Promise<OffsetPaginatedDto<PageOrderResDto>> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;
    const where = and(
      isNull(orders.deletedAt),
      keyword ? unaccentILike(orders.code, keyword) : undefined,
      reqDto.status ? eq(orders.status, reqDto.status) : undefined,
      reqDto.clientId ? eq(orders.clientId, reqDto.clientId) : undefined,
      reqDto.assignedUserId
        ? eq(orders.assignedUserId, reqDto.assignedUserId)
        : undefined,
      reqDto.startDate ? gte(orders.dueDate, reqDto.startDate) : undefined,
      reqDto.endDate ? lte(orders.dueDate, reqDto.endDate) : undefined,
    );
    const orderBy = desc(orders.createdAt);

    const [entities, countRows] = await Promise.all([
      this.db.query.orders.findMany({
        where,
        limit: reqDto.limit,
        offset: reqDto.offset,
        orderBy,
        extras: { expired: this.expiredSql(), totalVnd: this.totalVndSql() },
        with: {
          client: true,
          assignedUser: true,
          creatorBy: true,
          approverBy: true,
          rejecterBy: true,
        },
      }),
      this.db.select({ total: count() }).from(orders).where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(PageOrderResDto, entities, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(countRows[0]?.total ?? 0, reqDto),
    );
  }

  /** `expiredTrendCount` so "trễ hạn cách đây 1 tuần" với *trạng thái hôm nay*, không phải trạng
   * thái thật của dòng đó lúc 1 tuần trước — đơn trễ khi đó nhưng đã chuyển `CANCELLED` sẽ không
   * được tính, vì hệ thống không giữ lịch sử trạng thái. Xem mô tả từng field ở `OrderStatsResDto`. */
  async getOrderStats(): Promise<OrderStatsResDto> {
    // Lặp lại y hệt ở vài biểu thức bên dưới — mọi chỗ lặp phải giữ đúng nguyên văn để cùng trỏ
    // một khung thời gian, vì không có CTE ở đây để tính một lần.
    const thisMonth = sql`${orders.createdAt} >= date_trunc('month', now())`;
    const lastMonth = sql`${orders.createdAt} >= date_trunc('month', now()) - interval '1 month' and ${orders.createdAt} < date_trunc('month', now())`;
    // Mọi tổng dashboard phải cùng một đơn vị — cộng thẳng orders.total sẽ gộp đơn USD với đơn
    // VND. Đổi ra VND từng dòng trước khi aggregate; VND không có phần thập phân nên làm tròn 0.
    const totalVnd = sql`${orders.total} * ${orders.exchangeRate}`;

    const [row] = await this.db
      .select({
        totalOrders: count(),
        totalOrdersTrendPercent: sql<number | null>`round(
          case when count(*) filter (where ${lastMonth}) = 0 then null
            else (count(*) filter (where ${thisMonth})::numeric - count(*) filter (where ${lastMonth})::numeric)
                 / count(*) filter (where ${lastMonth}) * 100
          end, 1)`.mapWith(mapNullableNumber),
        totalValue:
          sql<number>`round(coalesce(sum(${totalVnd}), 0), 0)`.mapWith(Number),
        totalValueTrendPercent: sql<number | null>`round(
          case when coalesce(sum(${totalVnd}) filter (where ${lastMonth}), 0) = 0 then null
            else (coalesce(sum(${totalVnd}) filter (where ${thisMonth}), 0)
                  - coalesce(sum(${totalVnd}) filter (where ${lastMonth}), 0))
                 / coalesce(sum(${totalVnd}) filter (where ${lastMonth}), 0) * 100
          end, 1)`.mapWith(mapNullableNumber),
        completedValue:
          sql<number>`round(coalesce(sum(${totalVnd}) filter (where ${orders.status} = ${OrderStatus.COMPLETED}), 0), 0)`.mapWith(
            Number,
          ),
        completedValuePercentOfTotal: sql<number>`round(
          case when coalesce(sum(${totalVnd}), 0) = 0 then 0
            else coalesce(sum(${totalVnd}) filter (where ${orders.status} = ${OrderStatus.COMPLETED}), 0)
                 / sum(${totalVnd}) * 100
          end, 1)`.mapWith(Number),
        inProgress:
          sql<number>`count(*) filter (where ${orders.status} = ${OrderStatus.IN_PROGRESS})`.mapWith(
            Number,
          ),
        inProgressPercentOfTotal: sql<number>`round(
          case when count(*) = 0 then 0
            else count(*) filter (where ${orders.status} = ${OrderStatus.IN_PROGRESS})::numeric / count(*) * 100
          end, 1)`.mapWith(Number),
        expired:
          sql<number>`count(*) filter (where ${orders.dueDate} < now() and ${orders.status} not in (${OrderStatus.COMPLETED}, ${OrderStatus.CANCELLED}))`.mapWith(
            Number,
          ),
        expiredTrendCount: sql<number>`
          count(*) filter (where ${orders.dueDate} < now() and ${orders.status} not in (${OrderStatus.COMPLETED}, ${OrderStatus.CANCELLED}))
          - count(*) filter (where ${orders.dueDate} < now() - interval '7 days' and ${orders.status} not in (${OrderStatus.COMPLETED}, ${OrderStatus.CANCELLED}))
        `.mapWith(Number),
        completed:
          sql<number>`count(*) filter (where ${orders.status} = ${OrderStatus.COMPLETED})`.mapWith(
            Number,
          ),
        completedPercentOfTotal: sql<number>`round(
          case when count(*) = 0 then 0
            else count(*) filter (where ${orders.status} = ${OrderStatus.COMPLETED})::numeric / count(*) * 100
          end, 1)`.mapWith(Number),
      })
      .from(orders)
      .where(isNull(orders.deletedAt));

    return plainToInstance(OrderStatsResDto, row, {
      excludeExtraneousValues: true,
    });
  }

  async getOrder(orderId: string): Promise<OrderResDto> {
    // `orders` có 4 FK riêng biệt trỏ `users` (assignedUser/creator/approver/rejecter) — mỗi FK
    // cần một alias `users` khác nhau để LEFT JOIN cùng lúc, cùng khuôn `creatorBy`/`posterBy` ở
    // `OutsourcingOrdersService.getOutsourcingOrder`.
    const assignedUserAlias = alias(users, 'assigned_user');
    const creatorAlias = alias(users, 'creator');
    const approverAlias = alias(users, 'approver');
    const rejecterAlias = alias(users, 'rejecter');
    const paidByOrder = paidAmountByOrderIdSubquery(this.db);

    const [[order], orderFileRows] = await Promise.all([
      this.db
        .select({
          ...getTableColumns(orders),
          expired: this.expiredSql(),
          totalVnd: this.totalVndSql(),
          client: getTableColumns(clients),
          assignedUser: getTableColumns(assignedUserAlias),
          creatorBy: getTableColumns(creatorAlias),
          approverBy: getTableColumns(approverAlias),
          rejecterBy: getTableColumns(rejecterAlias),
          paidAmount:
            sql<number>`coalesce(${paidByOrder.paidAmount}, 0)`.mapWith(Number),
        })
        .from(orders)
        .leftJoin(clients, eq(clients.id, orders.clientId))
        .leftJoin(
          assignedUserAlias,
          eq(assignedUserAlias.id, orders.assignedUserId),
        )
        .leftJoin(creatorAlias, eq(creatorAlias.id, orders.createdBy))
        .leftJoin(approverAlias, eq(approverAlias.id, orders.approvedBy))
        .leftJoin(rejecterAlias, eq(rejecterAlias.id, orders.rejectedBy))
        .leftJoin(paidByOrder, eq(paidByOrder.orderId, orders.id))
        .where(and(eq(orders.id, orderId), isNull(orders.deletedAt))),
      this.db
        .select({
          ...getTableColumns(orderFiles),
          file: getTableColumns(files),
        })
        .from(orderFiles)
        .innerJoin(files, eq(files.id, orderFiles.fileId))
        .where(eq(orderFiles.orderId, orderId)),
    ]);

    if (!order) {
      throw new AppException(ErrorCode.E057, HttpStatus.NOT_FOUND);
    }

    return plainToInstance(
      OrderResDto,
      {
        ...order,
        files: orderFileRows,
        paymentStatus: this.resolvePaymentStatus(order.paidAmount, order.total),
      },
      { excludeExtraneousValues: true },
    );
  }

  async getOrderItems(orderId: string): Promise<OrderItemResDto[]> {
    await this.ensureOrderExists(orderId);

    const issuedByItem = issuedQuantityByOrderItemIdSubquery(this.db);

    const rows = await this.db
      .select({
        ...getTableColumns(orderItems),
        item: getTableColumns(items),
        unit: getTableColumns(units),
        imageFile: getTableColumns(files),
        issuedQty: sql<number>`coalesce(${issuedByItem.issuedQty}, 0)`.mapWith(
          Number,
        ),
        // Không kẹp sàn 0 — để lộ ra nếu dòng bị xuất vượt SL đặt thay vì giấu đi (chưa bị chặn
        // ở tầng ghi, xem `docs/domains/inventory.md`).
        remainingQty:
          sql<number>`${orderItems.quantity} - coalesce(${issuedByItem.issuedQty}, 0)`.mapWith(
            Number,
          ),
      })
      .from(orderItems)
      .innerJoin(items, eq(items.id, orderItems.itemId))
      .innerJoin(units, eq(units.id, items.unitId))
      .leftJoin(files, eq(files.id, items.imageFileId))
      .leftJoin(issuedByItem, eq(issuedByItem.orderItemId, orderItems.id))
      .where(eq(orderItems.orderId, orderId))
      .orderBy(asc(orderItems.sortOrder), asc(orderItems.createdAt));

    return plainToInstance(OrderItemResDto, rows, {
      excludeExtraneousValues: true,
    });
  }

  async getOrderPayments(orderId: string): Promise<OrderPaymentResDto[]> {
    await this.ensureOrderExists(orderId);

    const rows = await this.db.query.orderPayments.findMany({
      where: eq(orderPayments.orderId, orderId),
      orderBy: [desc(orderPayments.paidAt), desc(orderPayments.createdAt)],
      with: { creatorBy: true },
    });

    return plainToInstance(OrderPaymentResDto, rows, {
      excludeExtraneousValues: true,
    });
  }

  async createOrderPayment(
    orderId: string,
    reqDto: CreateOrderPaymentReqDto,
    userId: string,
  ): Promise<void> {
    await this.ensureOrderExists(orderId);

    if (reqDto.amount === 0) {
      throw new AppException(ErrorCode.E208, HttpStatus.BAD_REQUEST);
    }

    await this.db.insert(orderPayments).values({
      ...reqDto,
      orderId,
      createdBy: userId,
    });
  }

  private resolvePaymentStatus(
    paidAmount: number,
    total: number,
  ): OrderPaymentStatus {
    if (paidAmount <= 0) {
      return OrderPaymentStatus.UNPAID;
    } else if (paidAmount >= total) {
      return OrderPaymentStatus.PAID;
    } else {
      return OrderPaymentStatus.PARTIAL;
    }
  }

  async createOrder(reqDto: CreateOrderReqDto, userId: string): Promise<void> {
    if (reqDto.clientId) {
      await this.ensureClientExists(reqDto.clientId);
    }
    if (reqDto.assignedUserId) {
      await this.ensureAssignedUserExists(reqDto.assignedUserId);
    }
    if (reqDto.items?.length) {
      await this.ensureItemsExist(reqDto.items.map((item) => item.itemId));
    }
    this.ensureStatusSettable(reqDto.status);

    await this.filesService.linkFiles(reqDto.fileIds ?? []);

    const { items, fileIds, ...orderFields } = reqDto;
    const currency = orderFields.currency ?? Currency.VND;

    // Order, dòng, đính kèm và total dẫn xuất từ dòng phải vào cùng lúc — nếu không, insert dòng
    // lỗi sẽ để lại một order đã commit với `total = 0` không bao giờ được tính lại.
    await this.db.transaction(async (tx) => {
      const code = await this.generateOrderCode(tx);
      const [order] = await tx
        .insert(orders)
        .values({
          ...orderFields,
          exchangeRate: this.enforceExchangeRate(
            currency,
            orderFields.exchangeRate,
          ),
          code,
          status: reqDto.status ?? OrderStatus.DRAFT,
          createdBy: userId,
        })
        .returning();

      if (items?.length) {
        // `lineTotal` để mặc định của cột — `recalculateTotals` điền giá trị thật ngay sau.
        await tx
          .insert(orderItems)
          .values(items.map((item) => ({ ...item, orderId: order.id })));
      }
      if (fileIds?.length) {
        await tx
          .insert(orderFiles)
          .values(fileIds.map((fileId) => ({ orderId: order.id, fileId })));
      }

      await this.recalculateTotals(tx, order.id);
    });
  }

  async updateOrder(orderId: string, reqDto: UpdateOrderReqDto): Promise<void> {
    const existing = await this.ensureOrderExists(orderId);
    this.ensureOrderEditable(existing.status);

    if (reqDto.clientId) {
      await this.ensureClientExists(reqDto.clientId);
    }
    if (reqDto.assignedUserId) {
      await this.ensureAssignedUserExists(reqDto.assignedUserId);
    }
    if (reqDto.items?.length) {
      await this.ensureItemsExist(reqDto.items.map((item) => item.itemId));
    }
    this.ensureStatusSettable(reqDto.status);
    if (reqDto.items !== undefined) {
      await this.ensureItemsNotLockedByProduction(orderId);
    }

    await this.filesService.linkFiles(reqDto.fileIds ?? []);

    const { items, fileIds, ...orderFields } = reqDto;
    // So với currency hiện tại của dòng khi request không đụng tới `currency`.
    const currency = orderFields.currency ?? existing.currency;
    // Sửa một đơn đang REJECTED = làm lại từ đầu → tự về DRAFT, giữ nguyên rejectedBy/rejectedAt/
    // rejectionReason làm lịch sử. Request gửi `status` rõ ràng (vd CANCELLED) thì tôn trọng nó.
    const revertsToDraft =
      existing.status === OrderStatus.REJECTED && reqDto.status === undefined;

    await this.db.transaction(async (tx) => {
      await tx
        .update(orders)
        .set({
          ...orderFields,
          exchangeRate: this.enforceExchangeRate(
            currency,
            orderFields.exchangeRate,
          ),
          ...(revertsToDraft && { status: OrderStatus.DRAFT }),
        })
        .where(eq(orders.id, orderId));

      if (items !== undefined) {
        // `ensureItemsNotLockedByProduction` ở trên đã đảm bảo LSX (nếu có) đang PENDING, chưa
        // duyệt — xoá header `production_orders` cascade dọn luôn `production_order_items`, để
        // FK `order_item_id` (restrict) không chặn lệnh xoá của `replaceOrderItems` bên dưới (xem
        // comment schema trên `productionOrderItems`).
        await tx
          .delete(productionOrders)
          .where(eq(productionOrders.orderId, orderId));
        await this.replaceOrderItems(tx, orderId, items);
      }
      if (fileIds !== undefined) {
        await this.replaceFiles(tx, orderId, fileIds);
      }

      // Luôn tính lại kể cả khi không gửi `items`: riêng discountType/discountValue/vatPercent/
      // shippingFee cũng đủ đổi total header mà không đụng dòng nào.
      await this.recalculateTotals(tx, orderId);
    });
  }

  /** Nơi duy nhất ghi `AWAITING_PRODUCTION` (xem `ensureStatusSettable`) — đồng thời sinh sẵn kế
   * hoạch sản xuất trong cùng transaction, để không có trạng thái "duyệt nửa vời" không kế hoạch. */
  async approveOrder(orderId: string, userId: string): Promise<void> {
    const existing = await this.ensureOrderExists(orderId);
    this.ensurePendingConfirmation(existing.status);
    // Đơn quay lại PENDING_CONFIRMATION rồi duyệt lại (qua PATCH không kèm items) mà LSX cũ đã
    // APPROVED thì seedPlan bên dưới xoá production_orders — cascade luôn Job/operations đang có
    // OQC restrict trỏ vào, ra 23503 thay vì lỗi nghiệp vụ rõ ràng.
    await this.ensureItemsNotLockedByProduction(orderId);

    const planItems =
      await this.productionOrdersService.getInitialPlanItems(orderId);

    await this.db.transaction(async (tx) => {
      await tx
        .update(orders)
        .set({
          status: OrderStatus.AWAITING_PRODUCTION,
          approvedBy: userId,
          approvedAt: new Date(),
        })
        .where(eq(orders.id, orderId));

      await this.productionOrdersService.seedPlan(
        tx,
        orderId,
        planItems,
        userId,
      );
    });
  }

  /** Sửa lại (không kèm `status`) mới tự về `DRAFT` — xem `updateOrder`. */
  async rejectOrder(
    orderId: string,
    reqDto: RejectOrderReqDto,
    userId: string,
  ): Promise<void> {
    const existing = await this.ensureOrderExists(orderId);
    this.ensurePendingConfirmation(existing.status);

    await this.db
      .update(orders)
      .set({
        status: OrderStatus.REJECTED,
        rejectedBy: userId,
        rejectedAt: new Date(),
        rejectionReason: reqDto.reason,
      })
      .where(eq(orders.id, orderId));
  }

  /** "Trễ hạn": tính lúc đọc, không lưu — dueDate quá hạn trên đơn chưa tới trạng thái cuối. Không
   * có `dueDate` thì không bao giờ trễ. Tính trong Postgres (`extras`), không lặp lại trong JS. */
  private expiredSql() {
    return sql<boolean>`${orders.dueDate} is not null
      and ${orders.status} not in (${OrderStatus.COMPLETED}, ${OrderStatus.CANCELLED})
      and ${orders.dueDate} < now()`.as('expired');
  }

  /** Quy đổi `total` sang VND lúc đọc từ `total`/`exchangeRate` của chính đơn — không thêm cột,
   * không backfill, nên không bao giờ lệch với hai giá trị gốc. */
  private totalVndSql() {
    return sql<number>`round(${orders.total} * ${orders.exchangeRate}, 2)`
      .mapWith(Number)
      .as('totalVnd');
  }

  /** Đơn VND luôn có rate = 1 — `totalVndSql`/`getOrderStats` nhân `exchangeRate` để quy mọi đơn về
   * một đơn vị, nên một rate lệch trên đơn VND (bug client, input sai) sẽ âm thầm làm sai mọi tổng
   * dashboard. */
  private enforceExchangeRate(
    currency: Currency,
    exchangeRate: number | undefined,
  ): number | undefined {
    return currency === Currency.VND ? 1 : exchangeRate;
  }

  /** Tính lại mọi cột tiền do server sở hữu, từ `order_items`, hai câu SQL: refresh `lineTotal`
   * từng dòng, rồi gộp tổng các dòng không `CANCELLED` vào discount/VAT/total header. Bắt buộc
   * chạy trong cùng transaction với write vừa đụng `order_items` hoặc discount/VAT/shipping. */
  private async recalculateTotals(
    tx: DbTransaction,
    orderId: string,
  ): Promise<void> {
    await tx.execute(sql`
      UPDATE order_items
      SET line_total = round(quantity * unit_price * (1 - discount_percent / 100), 2)
      WHERE order_id = ${orderId}
    `);

    await tx.execute(sql`
      WITH agg AS (
        SELECT coalesce(sum(line_total), 0) AS subtotal
        FROM order_items
        WHERE order_id = ${orderId} AND status <> 'CANCELLED'
      ),
      calc AS (
        SELECT a.subtotal,
               CASE WHEN o.discount_type = 'PERCENT'
                    THEN round(a.subtotal * o.discount_value / 100, 2)
                    ELSE o.discount_value END AS discount_amount,
               o.vat_percent,
               o.shipping_fee
        FROM orders o CROSS JOIN agg a
        WHERE o.id = ${orderId}
      )
      UPDATE orders o
      SET subtotal        = c.subtotal,
          discount_amount = c.discount_amount,
          vat_amount      = round((c.subtotal - c.discount_amount) * c.vat_percent / 100, 2),
          total           = c.subtotal - c.discount_amount
                            + round((c.subtotal - c.discount_amount) * c.vat_percent / 100, 2)
                            + c.shipping_fee,
          updated_at      = now()
      FROM calc c
      WHERE o.id = ${orderId}
    `);
  }

  /** Replace-all. Bắt buộc truyền `tx` để tránh ghi ra ngoài transaction. */
  private async replaceOrderItems(
    tx: DbTransaction,
    orderId: string,
    items: OrderItemReqDto[],
  ): Promise<void> {
    await tx.delete(orderItems).where(eq(orderItems.orderId, orderId));

    if (items.length) {
      // `lineTotal` để mặc định của cột — `recalculateTotals` điền giá trị thật ngay sau.
      await tx
        .insert(orderItems)
        .values(items.map((item) => ({ ...item, orderId })));
    }
  }

  /** Replace-all. Bắt buộc truyền `tx` để tránh ghi ra ngoài transaction. */
  private async replaceFiles(
    tx: DbTransaction,
    orderId: string,
    fileIds: string[],
  ): Promise<void> {
    await tx.delete(orderFiles).where(eq(orderFiles.orderId, orderId));

    if (fileIds.length) {
      await tx
        .insert(orderFiles)
        .values(fileIds.map((fileId) => ({ orderId, fileId })));
    }
  }

  private async generateOrderCode(tx: DbTransaction): Promise<string> {
    const sequence = await generateDocumentSequence(tx, DocumentType.ORDER);

    return `SO${String(sequence).padStart(4, '0')}`;
  }

  private async ensureClientExists(clientId: string): Promise<void> {
    const existing = await this.db.query.clients.findFirst({
      columns: { id: true },
      where: and(eq(clients.id, clientId), isNull(clients.deletedAt)),
    });

    if (!existing) {
      throw new AppException(ErrorCode.E059, HttpStatus.NOT_FOUND);
    }
  }

  private async ensureAssignedUserExists(
    assignedUserId: string,
  ): Promise<void> {
    const existing = await this.db.query.users.findFirst({
      columns: { id: true },
      where: eq(users.id, assignedUserId),
    });

    if (!existing) {
      throw new AppException(ErrorCode.E060, HttpStatus.NOT_FOUND);
    }
  }

  private async ensureItemsExist(itemIds: string[]): Promise<void> {
    const uniqueIds = [...new Set(itemIds)];
    const found = await this.db.query.items.findMany({
      columns: { id: true },
      where: and(inArray(items.id, uniqueIds), isNull(items.deletedAt)),
    });

    if (found.length !== uniqueIds.length) {
      throw new AppException(ErrorCode.E061, HttpStatus.NOT_FOUND);
    }
  }

  /** Chặn sửa `items` khi LSX của đơn này đã `APPROVED` — duyệt LSX là chốt kế hoạch một chiều.
   * Header `PENDING` không chặn — `updateOrder` tự xoá header đó trước khi replace `items`. Đọc
   * thẳng `production_orders` thay vì gọi qua `ProductionOrdersService`, cùng cách
   * `InventoryService.reservedSubquery` đọc thẳng `order_items`. */
  private async ensureItemsNotLockedByProduction(
    orderId: string,
  ): Promise<void> {
    const approved = await this.db.query.productionOrders.findFirst({
      columns: { id: true },
      where: and(
        eq(productionOrders.orderId, orderId),
        eq(productionOrders.status, ProductionOrderStatus.APPROVED),
      ),
    });

    if (approved) {
      throw new AppException(ErrorCode.E080, HttpStatus.CONFLICT);
    }
  }

  /** Khoá khi đơn đã tới trạng thái cuối (`COMPLETED`/`CANCELLED`, `E065`) hoặc đang chờ duyệt
   * (`PENDING_CONFIRMATION`, `E090`) — tránh đổi dữ liệu trong lúc Giám đốc đang xem để duyệt. Mọi
   * trạng thái khác vẫn sửa được. */
  private ensureOrderEditable(status: OrderStatus): void {
    if (status === OrderStatus.COMPLETED || status === OrderStatus.CANCELLED) {
      throw new AppException(ErrorCode.E065, HttpStatus.CONFLICT);
    }
    if (status === OrderStatus.PENDING_CONFIRMATION) {
      throw new AppException(ErrorCode.E090, HttpStatus.CONFLICT);
    }
  }

  /** `AWAITING_PRODUCTION`/`REJECTED` chỉ do `approveOrder`/`rejectOrder` ghi — `POST`/
   * `PATCH /orders` không được set thẳng, để duyệt/từ chối của Giám đốc không bị lách qua PATCH
   * status. Trạng thái khác tự do. */
  private ensureStatusSettable(status: OrderStatus | undefined): void {
    if (
      status === OrderStatus.AWAITING_PRODUCTION ||
      status === OrderStatus.REJECTED
    ) {
      throw new AppException(ErrorCode.E075, HttpStatus.BAD_REQUEST);
    }
  }

  /** `approveOrder`/`rejectOrder` chỉ hợp lệ từ `PENDING_CONFIRMATION`. */
  private ensurePendingConfirmation(status: OrderStatus): void {
    if (status !== OrderStatus.PENDING_CONFIRMATION) {
      throw new AppException(ErrorCode.E074, HttpStatus.CONFLICT);
    }
  }

  private async ensureOrderExists(
    orderId: string,
  ): Promise<{ id: string; status: OrderStatus; currency: Currency }> {
    const existing = await this.db.query.orders.findFirst({
      columns: { id: true, status: true, currency: true },
      where: and(eq(orders.id, orderId), isNull(orders.deletedAt)),
    });

    if (!existing) {
      throw new AppException(ErrorCode.E057, HttpStatus.NOT_FOUND);
    }

    return existing;
  }
}
