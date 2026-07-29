import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  sql,
} from 'drizzle-orm';

import { OffsetPaginationDto } from '../../common/dto/offset-pagination/offset-pagination.dto';
import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { unaccentILike } from '../../common/utils/search.util';
import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import type { Database, DbTransaction } from '../../database/database.type';
import {
  clients,
  Currency,
  orderAttachments,
  orderItems,
  orders,
  OrderStatus,
  productionOrders,
  ProductionOrderStatus,
  products,
  users,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { FilesService } from '../files/files.service';
import { ProductionOrdersService } from '../production-orders/production-orders.service';
import { CreateOrderReqDto } from './dto/create-order.req.dto';
import { GetOrdersReqDto } from './dto/get-orders.req.dto';
import { OrderItemReqDto } from './dto/order-item.req.dto';
import { OrderResDto } from './dto/order.res.dto';
import { OrderStatsResDto } from './dto/order-stats.res.dto';
import { RejectOrderReqDto } from './dto/reject-order.req.dto';
import { UpdateOrderReqDto } from './dto/update-order.req.dto';

/** `.mapWith(Number)` turns SQL `null` into `0` (`Number(null) === 0`) — wrong for a trend
 * percentage that means "no prior period to compare against". Use this `.mapWith` instead
 * wherever the expression can genuinely return SQL `null`. */
function mapNullableNumber(value: unknown): number | null {
  return value === null ? null : Number(value);
}

/**
 * Đơn hàng bắt đầu ở `DRAFT`, cần Giám đốc duyệt trước khi đưa vào sản xuất.
 *
 * Rules:
 * - `approveOrder` là con đường duy nhất để đạt `AWAITING_PRODUCTION`.
 * - Request tạo/sửa không được set thẳng trạng thái đó (`E075`).
 * - Các chuyển trạng thái khác vẫn tự do.
 *
 * See `ensureOrderEditable` để biết giới hạn khi sửa.
 */
@Injectable()
export class OrdersService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly filesService: FilesService,
    private readonly productionOrdersService: ProductionOrdersService,
  ) {}

  async getOrders(
    reqDto: GetOrdersReqDto,
  ): Promise<OffsetPaginatedDto<OrderResDto>> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;
    const where = and(
      isNull(orders.deletedAt),
      keyword ? unaccentILike(orders.code, keyword) : undefined,
      reqDto.status ? eq(orders.status, reqDto.status) : undefined,
      reqDto.clientId ? eq(orders.clientId, reqDto.clientId) : undefined,
      reqDto.staffId ? eq(orders.staffId, reqDto.staffId) : undefined,
      reqDto.fromDate ? gte(orders.dueDate, reqDto.fromDate) : undefined,
      reqDto.toDate ? lte(orders.dueDate, reqDto.toDate) : undefined,
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
          staff: true,
          creator: true,
          approver: true,
          rejecter: true,
        },
      }),
      this.db.select({ total: count() }).from(orders).where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(OrderResDto, entities, { excludeExtraneousValues: true }),
      new OffsetPaginationDto(countRows[0]?.total ?? 0, reqDto),
    );
  }

  /**
   * Dashboard cards. One conditional-aggregation query — `count(*)`/`sum(*) filter (where ...)`
   * per bucket, trend percentages computed via `round(...)` in the same query — so Postgres does
   * every number in one pass instead of the app fetching raw buckets and reducing them in JS.
   *
   * Rules:
   * - Two buckets are approximations, since the system keeps no order-status history (only the
   *   *current* status of each row).
   * - `completedValue` ("Đã giao") is `sum(total)` of `COMPLETED` orders, standing in for
   *   delivery/DO tracking the system doesn't have yet.
   * - `expiredTrendCount` re-evaluates "expired a week ago" against *today's* status
   *   (`dueDate < now() - 7d AND status NOT IN (COMPLETED, CANCELLED)`), not the row's real status
   *   a week ago — an order expired then but since moved to CANCELLED won't count.
   */
  async getOrderStats(): Promise<OrderStatsResDto> {
    // Repeated verbatim across a few expressions below — every occurrence must stay identical to
    // resolve to the same window, since there's no CTE here to compute it once.
    const thisMonth = sql`${orders.createdAt} >= date_trunc('month', now())`;
    const lastMonth = sql`${orders.createdAt} >= date_trunc('month', now()) - interval '1 month' and ${orders.createdAt} < date_trunc('month', now())`;
    // Every dashboard total must share one unit — summing `orders.total` directly would add a
    // USD order and a VND order together. Convert to VND per-row before aggregating; VND has no
    // sub-unit, so the two money totals below round to 0 decimals.
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

  async getOrderDetail(orderId: string): Promise<OrderResDto> {
    const order = await this.db.query.orders.findFirst({
      where: and(eq(orders.id, orderId), isNull(orders.deletedAt)),
      extras: { expired: this.expiredSql(), totalVnd: this.totalVndSql() },
      with: {
        client: true,
        staff: true,
        creator: true,
        approver: true,
        rejecter: true,
        items: {
          with: { product: { with: { unit: true, imageFile: true } } },
          orderBy: [asc(orderItems.sortOrder), asc(orderItems.createdAt)],
        },
        attachments: { with: { file: true } },
      },
    });

    if (!order) {
      throw new AppException(ErrorCode.E057, HttpStatus.NOT_FOUND);
    }

    return plainToInstance(OrderResDto, order, {
      excludeExtraneousValues: true,
    });
  }

  async createOrder(
    reqDto: CreateOrderReqDto,
    userId: string,
  ): Promise<OrderResDto> {
    // Every check below is a read, so it runs before the transaction opens — the transaction
    // only has to keep the writes together.
    let code = reqDto.code;
    if (code) {
      await this.validateCodeUniqueness(code);
    } else {
      code = await this.generateOrderCode();
    }

    if (reqDto.clientId) {
      await this.ensureClientExists(reqDto.clientId);
    }
    if (reqDto.staffId) {
      await this.ensureStaffExists(reqDto.staffId);
    }
    if (reqDto.items?.length) {
      await this.ensureProductsExist(
        reqDto.items.map((item) => item.productId),
      );
    }
    this.ensureStatusSettable(reqDto.status);

    await this.linkOrderFiles(reqDto);

    // `items`/`attachmentFileIds` live in their own tables, not columns on `orders` — peel them
    // off so the rest of the DTO spreads straight onto the row.
    const { items, attachmentFileIds, ...orderFields } = reqDto;

    // The order row, its lines, its attachments, and the totals derived from those lines must all
    // land together — without this transaction a failing line insert would leave a committed
    // order with a `total` of 0 that never gets recomputed.
    const orderId = await this.db.transaction(async (tx) => {
      const [order] = await tx
        .insert(orders)
        .values({
          ...orderFields,
          // A VND order's rate is always 1 — `totalVndSql`/`getOrderStats` multiply by
          // `exchangeRate` to convert every order to one currency, so a stray non-1 rate on a
          // VND order (client bug, bad input) would silently corrupt every dashboard total.
          exchangeRate:
            (orderFields.currency ?? Currency.VND) === Currency.VND
              ? 1
              : orderFields.exchangeRate,
          code,
          status: reqDto.status ?? OrderStatus.DRAFT,
          createdBy: userId,
        })
        .returning();

      if (items?.length) {
        await this.createItems(tx, order.id, items);
      }
      if (attachmentFileIds?.length) {
        await this.createAttachments(tx, order.id, attachmentFileIds);
      }

      await this.recalculateTotals(tx, order.id);

      return order.id;
    });

    return this.getOrderDetail(orderId);
  }

  async updateOrder(
    orderId: string,
    reqDto: UpdateOrderReqDto,
  ): Promise<OrderResDto> {
    const existing = await this.ensureOrderExists(orderId);
    this.ensureOrderEditable(existing.status);

    if (reqDto.clientId) {
      await this.ensureClientExists(reqDto.clientId);
    }
    if (reqDto.staffId) {
      await this.ensureStaffExists(reqDto.staffId);
    }
    if (reqDto.items?.length) {
      await this.ensureProductsExist(
        reqDto.items.map((item) => item.productId),
      );
    }
    this.ensureStatusSettable(reqDto.status);
    if (reqDto.items !== undefined) {
      await this.ensureItemsNotLockedByProduction(orderId);
    }

    await this.linkOrderFiles(reqDto);

    const { items, attachmentFileIds, ...orderFields } = reqDto;
    // Same VND-always-1 normalization as createOrder, resolved against the row's existing
    // currency when this request doesn't touch `currency` at all.
    const currency = orderFields.currency ?? existing.currency;
    const orderValues =
      currency === Currency.VND
        ? { ...orderFields, exchangeRate: 1 }
        : orderFields;

    await this.db.transaction(async (tx) => {
      // `updated_at` is bumped by the column's own `$onUpdate`.
      await tx.update(orders).set(orderValues).where(eq(orders.id, orderId));

      if (items !== undefined) {
        // `ensureItemsNotLockedByProduction` ở trên đã đảm bảo LSX (nếu có) đang PENDING, chưa
        // phát hành — xoá header `production_orders` cascade dọn luôn `production_order_items`,
        // để FK `order_item_id` (restrict) không chặn lệnh xoá của `replaceItems` bên dưới (xem
        // comment schema trên `productionOrderItems`).
        await tx
          .delete(productionOrders)
          .where(eq(productionOrders.orderId, orderId));
        await this.replaceItems(tx, orderId, items);
      }
      if (attachmentFileIds !== undefined) {
        await this.replaceAttachments(tx, orderId, attachmentFileIds);
      }

      // Always recompute, even when `items` wasn't sent: discountType/discountValue/vatPercent/
      // shippingFee alone can change the header totals without touching a single line.
      await this.recalculateTotals(tx, orderId);
    });

    return this.getOrderDetail(orderId);
  }

  async deleteOrder(orderId: string): Promise<void> {
    const existing = await this.ensureOrderExists(orderId);
    this.ensureOrderEditable(existing.status);

    await this.db
      .update(orders)
      .set({ deletedAt: new Date() })
      .where(eq(orders.id, orderId));
  }

  /**
   * Duyệt cấp Giám đốc (`orders:approve`) — chỉ hợp lệ khi đang PENDING_CONFIRMATION. Đây là nơi
   * duy nhất ghi `AWAITING_PRODUCTION` (xem `ensureStatusSettable`).
   *
   * Đồng thời sinh sẵn kế hoạch sản xuất (`docs/features/production.md`) cho mọi dòng NORMAL,
   * trong cùng transaction với việc đổi status — duyệt một PO mà không có kế hoạch để hiển thị ở
   * màn LSX sẽ là một trạng thái "duyệt nửa vời" không nhất quán.
   */
  async approveOrder(orderId: string, userId: string): Promise<OrderResDto> {
    const existing = await this.ensureOrderExists(orderId);
    this.ensurePendingConfirmation(existing.status);

    // Đọc trước khi mở transaction (`.claude/rules/api-module.md`) — tính kế hoạch có gọi
    // `InventoryService`, không có lý do gì phải chạy bên trong transaction của lệnh ghi này.
    const planItems =
      await this.productionOrdersService.buildInitialItems(orderId);

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

    return this.getOrderDetail(orderId);
  }

  /** Director-level rejection (`orders:approve`) — only valid from PENDING_CONFIRMATION. Sends
   * the order back to DRAFT so the sales staff can fix it and resubmit. */
  async rejectOrder(
    orderId: string,
    reqDto: RejectOrderReqDto,
    userId: string,
  ): Promise<OrderResDto> {
    const existing = await this.ensureOrderExists(orderId);
    this.ensurePendingConfirmation(existing.status);

    await this.db
      .update(orders)
      .set({
        status: OrderStatus.DRAFT,
        rejectedBy: userId,
        rejectedAt: new Date(),
        rejectionReason: reqDto.reason,
      })
      .where(eq(orders.id, orderId));

    return this.getOrderDetail(orderId);
  }

  /** "Trễ hạn": derived at read time, never stored — a due date in the past on an order that
   * hasn't reached a terminal state yet. No dueDate at all is never expired. Evaluated in
   * Postgres (via `extras`) rather than re-derived in JS per row after the fetch. */
  private expiredSql() {
    return sql<boolean>`${orders.dueDate} is not null
      and ${orders.status} not in (${OrderStatus.COMPLETED}, ${OrderStatus.CANCELLED})
      and ${orders.dueDate} < now()`.as('expired');
  }

  /** Order value converted to VND. Computed at read time from the order's own `total` and
   * `exchangeRate`, so it can never drift from either — no extra column, no backfill. */
  private totalVndSql() {
    return sql<number>`round(${orders.total} * ${orders.exchangeRate}, 2)`
      .mapWith(Number)
      .as('totalVnd');
  }

  /**
   * Recomputes every server-owned money column from `order_items` in two statements, entirely in
   * Postgres — no arithmetic happens in JS. First refreshes each line's `lineTotal`, then folds
   * the non-CANCELLED lines' sum into the header's discount/VAT/total columns. Must run inside the
   * same transaction as whatever write touched `order_items`/the discount-VAT-shipping inputs.
   */
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

  /**
   * Validates every file id the request carries and marks them linked, so the orphan sweeper
   * leaves them alone. Runs **before** the transaction on purpose — see `FilesService.linkFiles`.
   */
  private async linkOrderFiles(
    reqDto: CreateOrderReqDto | UpdateOrderReqDto,
  ): Promise<void> {
    await this.filesService.linkFiles(reqDto.attachmentFileIds ?? []);
  }

  /**
   * Writes the line rows. Takes `tx` (not `this.db`) so it can only ever be called from inside an
   * open transaction — passing the pooled connection is a compile error. `lineTotal` is left to
   * the column's own default; `recalculateTotals` fills in the real value right after.
   */
  private async createItems(
    tx: DbTransaction,
    orderId: string,
    items: OrderItemReqDto[],
  ): Promise<void> {
    await tx
      .insert(orderItems)
      .values(items.map((item) => ({ ...item, orderId })));
  }

  /** Replace-all. `tx` is required so a caller cannot accidentally write outside the transaction. */
  private async replaceItems(
    tx: DbTransaction,
    orderId: string,
    items: OrderItemReqDto[],
  ): Promise<void> {
    await tx.delete(orderItems).where(eq(orderItems.orderId, orderId));

    if (items.length) {
      await this.createItems(tx, orderId, items);
    }
  }

  private async createAttachments(
    tx: DbTransaction,
    orderId: string,
    fileIds: string[],
  ): Promise<void> {
    await tx
      .insert(orderAttachments)
      .values(fileIds.map((fileId) => ({ orderId, fileId })));
  }

  /** Replace-all. `tx` is required so a caller cannot accidentally write outside the transaction. */
  private async replaceAttachments(
    tx: DbTransaction,
    orderId: string,
    fileIds: string[],
  ): Promise<void> {
    await tx
      .delete(orderAttachments)
      .where(eq(orderAttachments.orderId, orderId));

    if (fileIds.length) {
      await this.createAttachments(tx, orderId, fileIds);
    }
  }

  private async generateOrderCode(): Promise<string> {
    const [totalRows] = await this.db.select({ total: count() }).from(orders);
    return `SO${String((totalRows?.total ?? 0) + 1).padStart(4, '0')}`;
  }

  private async validateCodeUniqueness(code: string): Promise<void> {
    const existing = await this.db.query.orders.findFirst({
      columns: { id: true },
      where: eq(orders.code, code),
    });

    if (existing) {
      throw new AppException(ErrorCode.E058, HttpStatus.CONFLICT);
    }
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

  private async ensureStaffExists(staffId: string): Promise<void> {
    const existing = await this.db.query.users.findFirst({
      columns: { id: true },
      where: eq(users.id, staffId),
    });

    if (!existing) {
      throw new AppException(ErrorCode.E060, HttpStatus.NOT_FOUND);
    }
  }

  /** Checks every `productId` in one `inArray` query instead of one round-trip per line. */
  private async ensureProductsExist(productIds: string[]): Promise<void> {
    const uniqueIds = [...new Set(productIds)];
    const found = await this.db.query.products.findMany({
      columns: { id: true },
      where: and(inArray(products.id, uniqueIds), isNull(products.deletedAt)),
    });

    if (found.length !== uniqueIds.length) {
      throw new AppException(ErrorCode.E061, HttpStatus.NOT_FOUND);
    }
  }

  /** Chặn sửa `items` khi LSX (`production_orders`, header) của đơn này đã `ISSUED` — phát hành
   * là chốt một chiều, sửa `order_items` sau đó sẽ làm lệch số liệu `production_jobs` đã sinh.
   * Header đang `PENDING` (mới là kế hoạch, chưa phát hành) không chặn — `updateOrder` tự xoá
   * header đó (cascade dọn `production_order_items`) ngay trước khi replace `items`. Đọc thẳng
   * `production_orders` thay vì thêm một hàm dùng-một-lần vào `ProductionOrdersService` — cùng
   * cách làm `InventoryService.reservedSubquery` đọc thẳng `order_items` thay vì phụ thuộc vào
   * `OrdersService`. */
  private async ensureItemsNotLockedByProduction(
    orderId: string,
  ): Promise<void> {
    const issued = await this.db.query.productionOrders.findFirst({
      columns: { id: true },
      where: and(
        eq(productionOrders.orderId, orderId),
        eq(productionOrders.status, ProductionOrderStatus.ISSUED),
      ),
    });

    if (issued) {
      throw new AppException(ErrorCode.E080, HttpStatus.CONFLICT);
    }
  }

  /** Locked once an order reaches a terminal state — `COMPLETED` or `CANCELLED`. Every other
   * status (`DRAFT`, `PENDING_CONFIRMATION`, `AWAITING_PRODUCTION`, `IN_PROGRESS`) stays editable. */
  private ensureOrderEditable(status: OrderStatus): void {
    if (status === OrderStatus.COMPLETED || status === OrderStatus.CANCELLED) {
      throw new AppException(ErrorCode.E065, HttpStatus.CONFLICT);
    }
  }

  /** `AWAITING_PRODUCTION` is only ever written by `approveOrder` — a plain `POST /orders`/
   * `PATCH /orders/:orderId` may not set it directly, so a director's approval can't be
   * bypassed by just PATCHing the status field. Every other status stays freely settable. */
  private ensureStatusSettable(status: OrderStatus | undefined): void {
    if (status === OrderStatus.AWAITING_PRODUCTION) {
      throw new AppException(ErrorCode.E075, HttpStatus.BAD_REQUEST);
    }
  }

  /** `approveOrder`/`rejectOrder` are only valid from PENDING_CONFIRMATION — an order that hasn't
   * been submitted for approval (still DRAFT), or one already past this gate, can't be
   * approved/rejected again. */
  private ensurePendingConfirmation(status: OrderStatus): void {
    if (status !== OrderStatus.PENDING_CONFIRMATION) {
      throw new AppException(ErrorCode.E074, HttpStatus.CONFLICT);
    }
  }

  /** Returns `status`/`currency` right away (needed by every caller to guard against writing a
   * terminal order, and by `updateOrder` to resolve the row's effective currency) instead of a
   * second re-fetch. */
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
