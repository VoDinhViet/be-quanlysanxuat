import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import {
  and,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lt,
  lte,
  ne,
  or,
  sum,
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
  orders,
  OrderStatus,
  products,
  users,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { CreateOrderReqDto } from './dto/create-order.req.dto';
import { GetOrdersReqDto } from './dto/get-orders.req.dto';
import type { OrderItemReqDto } from './dto/order-item.req.dto';
import { OrderResDto } from './dto/order.res.dto';
import { OrderStatsResDto } from './dto/order-stats.res.dto';
import { UpdateOrderReqDto } from './dto/update-order.req.dto';

const ORDER_LIST_WITH = {
  client: true,
  staff: true,
  creator: true,
} as const;

/** A resolved `order_items` row, values already `String()`-ified for the numeric(...) columns —
 * what `insertOrderItems`/`replaceOrderItems` write, and what `computeTotalAmount` sums over. */
type OrderItemRow = {
  productId: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
  sortOrder: number;
};

@Injectable()
export class OrdersService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async getOrders(
    reqDto: GetOrdersReqDto,
  ): Promise<OffsetPaginatedDto<OrderResDto>> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;
    const where = and(
      isNull(orders.deletedAt),
      keyword
        ? or(
            unaccentILike(orders.code, keyword),
            inArray(
              orders.clientId,
              this.db
                .select({ id: clients.id })
                .from(clients)
                .where(unaccentILike(clients.name, keyword)),
            ),
          )
        : undefined,
      reqDto.status ? eq(orders.status, reqDto.status) : undefined,
      reqDto.clientId ? eq(orders.clientId, reqDto.clientId) : undefined,
      reqDto.staffId ? eq(orders.staffId, reqDto.staffId) : undefined,
      reqDto.fromDate ? gte(orders.orderDate, reqDto.fromDate) : undefined,
      reqDto.toDate ? lte(orders.orderDate, reqDto.toDate) : undefined,
    );
    const orderBy = desc(orders.createdAt);

    const [entities, countRows] = await Promise.all([
      this.db.query.orders.findMany({
        where,
        limit: reqDto.limit,
        offset: reqDto.offset,
        orderBy,
        with: ORDER_LIST_WITH,
      }),
      this.db.select({ total: count() }).from(orders).where(where),
    ]);

    const enriched = entities.map((order) => ({
      ...order,
      isOverdue: this.computeIsOverdue(order),
    }));

    return new OffsetPaginatedDto(
      plainToInstance(OrderResDto, enriched, { excludeExtraneousValues: true }),
      new OffsetPaginationDto(countRows[0]?.total ?? 0, reqDto),
    );
  }

  /** Dashboard cards: total order count/value, count by status, count of overdue orders. One
   * grouped-count(+sum) query plus one filtered count, run in parallel — same shape as
   * `SuppliersService.getSupplierStats`, extended with a `sum()` aggregate (no prior precedent
   * for `sum` in this repo) and a second query for the "overdue" bucket (not a `status` value). */
  async getOrderStats(): Promise<OrderStatsResDto> {
    const [statusRows, overdueRows] = await Promise.all([
      this.db
        .select({
          status: orders.status,
          total: count(),
          value: sum(orders.totalAmount),
        })
        .from(orders)
        .where(isNull(orders.deletedAt))
        .groupBy(orders.status),
      this.db
        .select({ total: count() })
        .from(orders)
        .where(
          and(
            isNull(orders.deletedAt),
            lt(orders.deliveryDate, new Date()),
            inArray(orders.status, [
              OrderStatus.DRAFT,
              OrderStatus.CONFIRMED,
              OrderStatus.IN_PROGRESS,
            ]),
          ),
        ),
    ]);

    const byStatus = Object.fromEntries(
      statusRows.map((row) => [row.status, row.total]),
    );

    return plainToInstance(
      OrderStatsResDto,
      {
        totalOrders: statusRows.reduce((sum, row) => sum + row.total, 0),
        totalValue: statusRows.reduce(
          (sum, row) => sum + Number(row.value ?? 0),
          0,
        ),
        overdue: overdueRows[0]?.total ?? 0,
        draft: byStatus[OrderStatus.DRAFT] ?? 0,
        confirmed: byStatus[OrderStatus.CONFIRMED] ?? 0,
        inProgress: byStatus[OrderStatus.IN_PROGRESS] ?? 0,
        completed: byStatus[OrderStatus.COMPLETED] ?? 0,
        cancelled: byStatus[OrderStatus.CANCELLED] ?? 0,
      },
      { excludeExtraneousValues: true },
    );
  }

  async getOrderDetail(orderId: string): Promise<OrderResDto> {
    const order = await this.db.query.orders.findFirst({
      where: and(eq(orders.id, orderId), isNull(orders.deletedAt)),
      with: {
        ...ORDER_LIST_WITH,
        items: {
          with: { product: true },
          orderBy: (fields, { asc }) => asc(fields.sortOrder),
        },
      },
    });

    if (!order) {
      throw new AppException(ErrorCode.E057, HttpStatus.NOT_FOUND);
    }

    return plainToInstance(
      OrderResDto,
      {
        ...order,
        items: order.items.map((item) => this.normalizeItemNumerics(item)),
        isOverdue: this.computeIsOverdue(order),
      },
      { excludeExtraneousValues: true },
    );
  }

  /**
   * Drizzle's relational query builder fetches "many" relations (here: `items`) via Postgres JSON
   * aggregation (`json_build_object`/`json_agg`) under the hood — and Postgres's `numeric` → JSON
   * conversion is lossy for trailing zeros (`'2000000.00'::numeric` becomes the JSON number
   * `2000000`, round-tripping back as the string `"2000000"`). The root `orders` row doesn't go
   * through that path and keeps its fixed-scale string as-is (`"2500000.00"`). Re-fixing each
   * item's numeric fields here keeps the two consistent — same value, same formatting.
   */
  private normalizeItemNumerics<
    T extends { quantity: string; unitPrice: string; lineTotal: string },
  >(item: T): T {
    return {
      ...item,
      quantity: Number(item.quantity).toFixed(3),
      unitPrice: Number(item.unitPrice).toFixed(2),
      lineTotal: Number(item.lineTotal).toFixed(2),
    };
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

    await this.ensureClientExists(reqDto.clientId);
    if (reqDto.staffId) {
      await this.ensureStaffExists(reqDto.staffId);
    }

    const itemRows = reqDto.items?.length
      ? await this.resolveItemRows(reqDto.items)
      : [];
    const totalAmount = this.computeTotalAmount(itemRows);

    // The order row and its line items must land together: without this transaction a failing
    // item insert would leave a committed order with the wrong (zero) totalAmount.
    const orderId = await this.db.transaction(async (tx) => {
      const [order] = await tx
        .insert(orders)
        .values({
          code,
          clientId: reqDto.clientId,
          staffId: reqDto.staffId ?? null,
          orderDate: reqDto.orderDate ?? new Date(),
          deliveryDate: reqDto.deliveryDate,
          paymentTerms: reqDto.paymentTerms,
          status: reqDto.status ?? OrderStatus.DRAFT,
          totalAmount,
          note: reqDto.note,
          createdBy: userId,
        })
        .returning();

      if (itemRows.length) {
        await this.insertOrderItems(tx, order.id, itemRows);
      }

      return order.id;
    });

    return this.getOrderDetail(orderId);
  }

  async updateOrder(
    orderId: string,
    reqDto: UpdateOrderReqDto,
  ): Promise<OrderResDto> {
    await this.ensureOrderExists(orderId);

    if (reqDto.code) {
      await this.validateCodeUniqueness(reqDto.code, orderId);
    }
    if (reqDto.clientId) {
      await this.ensureClientExists(reqDto.clientId);
    }
    if (reqDto.staffId) {
      await this.ensureStaffExists(reqDto.staffId);
    }

    const { items, ...orderFields } = reqDto;

    // `items` sent (even `[]`) → replace-all + recompute totalAmount; omitted → leave both alone.
    let itemRows: OrderItemRow[] | undefined;
    let totalAmount: string | undefined;
    if (items !== undefined) {
      itemRows = items.length ? await this.resolveItemRows(items) : [];
      totalAmount = this.computeTotalAmount(itemRows);
    }

    await this.db.transaction(async (tx) => {
      // `updatedAt` is always written — drizzle throws a bare "No values to set" (a 500) when
      // every value is `undefined`, the normal shape of a PATCH touching only `items`.
      await tx
        .update(orders)
        .set({ ...orderFields, totalAmount, updatedAt: new Date() })
        .where(eq(orders.id, orderId));

      if (itemRows !== undefined) {
        await this.replaceOrderItems(tx, orderId, itemRows);
      }
    });

    return this.getOrderDetail(orderId);
  }

  async deleteOrder(orderId: string): Promise<void> {
    await this.ensureOrderExists(orderId);

    await this.db
      .update(orders)
      .set({ deletedAt: new Date() })
      .where(eq(orders.id, orderId));
  }

  /** "Trễ hạn": derived at read time, never stored — a delivery date in the past on an order
   * that hasn't reached a terminal state yet. No deliveryDate at all is never overdue. */
  private computeIsOverdue(order: {
    deliveryDate: Date | null;
    status: OrderStatus;
  }): boolean {
    if (!order.deliveryDate) {
      return false;
    }
    if (
      order.status === OrderStatus.COMPLETED ||
      order.status === OrderStatus.CANCELLED
    ) {
      return false;
    }

    return order.deliveryDate.getTime() < Date.now();
  }

  /** Validates every `productId` referenced (batched) and computes each line's `lineTotal` +
   * a default `sortOrder` (submission order) when the caller didn't set one explicitly. */
  private async resolveItemRows(
    items: OrderItemReqDto[],
  ): Promise<OrderItemRow[]> {
    await this.ensureProductsExist(items.map((item) => item.productId));

    return items.map((item, index) => ({
      productId: item.productId,
      quantity: String(item.quantity),
      unitPrice: String(item.unitPrice),
      lineTotal: (
        Math.round(item.quantity * item.unitPrice * 100) / 100
      ).toFixed(2),
      sortOrder: item.sortOrder ?? index,
    }));
  }

  private computeTotalAmount(rows: OrderItemRow[]): string {
    const total = rows.reduce((sum, row) => sum + Number(row.lineTotal), 0);
    return (Math.round(total * 100) / 100).toFixed(2);
  }

  /** Takes `tx` (not `this.db`) so it can only ever be called from inside an open transaction —
   * passing the pooled connection is a compile error. */
  private async insertOrderItems(
    tx: DbTransaction,
    orderId: string,
    rows: OrderItemRow[],
  ): Promise<void> {
    await tx
      .insert(orderItems)
      .values(rows.map((row) => ({ orderId, ...row })));
  }

  private async replaceOrderItems(
    tx: DbTransaction,
    orderId: string,
    rows: OrderItemRow[],
  ): Promise<void> {
    await tx.delete(orderItems).where(eq(orderItems.orderId, orderId));

    if (rows.length) {
      await this.insertOrderItems(tx, orderId, rows);
    }
  }

  private async generateOrderCode(): Promise<string> {
    const [totalRows] = await this.db.select({ total: count() }).from(orders);
    return `SO${String((totalRows?.total ?? 0) + 1).padStart(4, '0')}`;
  }

  private async validateCodeUniqueness(
    code: string,
    ignoredOrderId?: string,
  ): Promise<void> {
    const where = ignoredOrderId
      ? and(eq(orders.code, code), ne(orders.id, ignoredOrderId))
      : eq(orders.code, code);

    const existing = await this.db.query.orders.findFirst({
      columns: { id: true },
      where,
    });

    if (existing) {
      throw new AppException(ErrorCode.E058, HttpStatus.CONFLICT);
    }
  }

  private async ensureOrderExists(orderId: string): Promise<void> {
    const existing = await this.db.query.orders.findFirst({
      columns: { id: true },
      where: and(eq(orders.id, orderId), isNull(orders.deletedAt)),
    });

    if (!existing) {
      throw new AppException(ErrorCode.E057, HttpStatus.NOT_FOUND);
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
      where: and(eq(users.id, staffId), isNull(users.deletedAt)),
    });

    if (!existing) {
      throw new AppException(ErrorCode.E060, HttpStatus.NOT_FOUND);
    }
  }

  private async ensureProductsExist(productIds: string[]): Promise<void> {
    const distinctIds = [...new Set(productIds)];
    const existing = await this.db.query.products.findMany({
      columns: { id: true },
      where: and(inArray(products.id, distinctIds), isNull(products.deletedAt)),
    });

    if (existing.length !== distinctIds.length) {
      throw new AppException(ErrorCode.E061, HttpStatus.NOT_FOUND);
    }
  }
}
