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
  orderAttachments,
  orderItems,
  orders,
  OrderStatus,
  products,
  users,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { FilesService } from '../files/files.service';
import { CreateOrderReqDto } from './dto/create-order.req.dto';
import { GetOrdersReqDto } from './dto/get-orders.req.dto';
import { OrderItemReqDto } from './dto/order-item.req.dto';
import { OrderResDto } from './dto/order.res.dto';
import { OrderStatsResDto } from './dto/order-stats.res.dto';
import { UpdateOrderReqDto } from './dto/update-order.req.dto';

/** `.mapWith(Number)` turns SQL `null` into `0` (`Number(null) === 0`) — wrong for a trend
 * percentage that means "no prior period to compare against". Use this `.mapWith` instead
 * wherever the expression can genuinely return SQL `null`. */
function mapNullableNumber(value: unknown): number | null {
  return value === null ? null : Number(value);
}

@Injectable()
export class OrdersService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly filesService: FilesService,
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
        extras: { expired: this.expiredSql() },
        with: { client: true, staff: true, creator: true },
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
   * Two buckets are approximations, since the system keeps no order-status history (only the
   * *current* status of each row):
   * - `completedValue` ("Đã giao"): there's no delivery/DO tracking yet, so this is `sum(total)`
   *   of `COMPLETED` orders, used as a stand-in.
   * - `expiredTrendCount`: "expired a week ago" is re-evaluated against *today's* status
   *   (`dueDate < now() - 7d AND status NOT IN (COMPLETED, CANCELLED)`), not the row's real status
   *   a week ago. An order that was expired then but has since moved to CANCELLED won't count.
   */
  async getOrderStats(): Promise<OrderStatsResDto> {
    // Repeated verbatim across a few expressions below — every occurrence must stay identical to
    // resolve to the same window, since there's no CTE here to compute it once.
    const thisMonth = sql`${orders.createdAt} >= date_trunc('month', now())`;
    const lastMonth = sql`${orders.createdAt} >= date_trunc('month', now()) - interval '1 month' and ${orders.createdAt} < date_trunc('month', now())`;

    const [row] = await this.db
      .select({
        totalOrders: count(),
        totalOrdersTrendPercent: sql<number | null>`round(
          case when count(*) filter (where ${lastMonth}) = 0 then null
            else (count(*) filter (where ${thisMonth})::numeric - count(*) filter (where ${lastMonth})::numeric)
                 / count(*) filter (where ${lastMonth}) * 100
          end, 1)`.mapWith(mapNullableNumber),
        totalValue: sql<number>`coalesce(sum(${orders.total}), 0)`.mapWith(
          Number,
        ),
        totalValueTrendPercent: sql<number | null>`round(
          case when coalesce(sum(${orders.total}) filter (where ${lastMonth}), 0) = 0 then null
            else (coalesce(sum(${orders.total}) filter (where ${thisMonth}), 0)
                  - coalesce(sum(${orders.total}) filter (where ${lastMonth}), 0))
                 / coalesce(sum(${orders.total}) filter (where ${lastMonth}), 0) * 100
          end, 1)`.mapWith(mapNullableNumber),
        completedValue:
          sql<number>`coalesce(sum(${orders.total}) filter (where ${orders.status} = ${OrderStatus.COMPLETED}), 0)`.mapWith(
            Number,
          ),
        completedValuePercentOfTotal: sql<number>`round(
          case when coalesce(sum(${orders.total}), 0) = 0 then 0
            else coalesce(sum(${orders.total}) filter (where ${orders.status} = ${OrderStatus.COMPLETED}), 0)
                 / sum(${orders.total}) * 100
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
      extras: { expired: this.expiredSql() },
      with: {
        client: true,
        staff: true,
        creator: true,
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
          code,
          status: reqDto.status ?? OrderStatus.CONFIRMED,
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

    await this.linkOrderFiles(reqDto);

    const { items, attachmentFileIds, ...orderFields } = reqDto;

    await this.db.transaction(async (tx) => {
      // `updated_at` is bumped by the column's own `$onUpdate`.
      await tx.update(orders).set(orderFields).where(eq(orders.id, orderId));

      if (items !== undefined) {
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

  /** "Trễ hạn": derived at read time, never stored — a due date in the past on an order that
   * hasn't reached a terminal state yet. No dueDate at all is never expired. Evaluated in
   * Postgres (via `extras`) rather than re-derived in JS per row after the fetch. */
  private expiredSql() {
    return sql<boolean>`${orders.dueDate} is not null
      and ${orders.status} not in (${OrderStatus.COMPLETED}, ${OrderStatus.CANCELLED})
      and ${orders.dueDate} < now()`.as('expired');
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

  /** Locked once an order reaches a terminal state — `COMPLETED` or `CANCELLED`. `CONFIRMED` and
   * `IN_PROGRESS` both stay editable. */
  private ensureOrderEditable(status: OrderStatus): void {
    if (status === OrderStatus.COMPLETED || status === OrderStatus.CANCELLED) {
      throw new AppException(ErrorCode.E065, HttpStatus.CONFLICT);
    }
  }

  /** Returns `status` right away (needed by every caller to guard against writing a terminal
   * order) instead of a second re-fetch. */
  private async ensureOrderExists(
    orderId: string,
  ): Promise<{ id: string; status: OrderStatus }> {
    const existing = await this.db.query.orders.findFirst({
      columns: { id: true, status: true },
      where: and(eq(orders.id, orderId), isNull(orders.deletedAt)),
    });

    if (!existing) {
      throw new AppException(ErrorCode.E057, HttpStatus.NOT_FOUND);
    }

    return existing;
  }
}
