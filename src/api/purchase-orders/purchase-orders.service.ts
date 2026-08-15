import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import {
  and,
  count,
  desc,
  eq,
  exists,
  gte,
  inArray,
  lt,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';

import { OffsetPaginationDto } from '../../common/dto/offset-pagination/offset-pagination.dto';
import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { unaccentILike } from '../../common/utils/search.util';
import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import type { Database, DbTransaction } from '../../database/database.type';
import {
  InventoryDocumentStatus,
  inventoryReceipts,
  items,
  purchaseOrderItems,
  purchaseOrders,
  purchaseRequestItems,
  purchaseRequests,
  PurchaseOrderStatus,
  users,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { WarehousesService } from '../warehouses/warehouses.service';
import { CancelPurchaseOrderReqDto } from './dto/cancel-purchase-order.req.dto';
import { GetPurchaseOrdersReqDto } from './dto/get-purchase-orders.req.dto';
import { PagePurchaseOrderResDto } from './dto/page-purchase-order.res.dto';
import { PurchaseOrderResDto } from './dto/purchase-order.res.dto';
import { UpdatePurchaseOrderItemReqDto } from './dto/update-purchase-order-item.req.dto';
import { UpdatePurchaseOrderReqDto } from './dto/update-purchase-order.req.dto';
import { PurchaseOrderProgress } from './purchase-orders.constant';
import {
  getReceivedQuantityByPurchaseOrderItemId,
  orderAggregateSubquery,
  orderReceivedQuantitySubquery,
} from './purchase-orders.query';
import type {
  CreateDraftOrdersFromQuotationInput,
  PurchaseOrderDraftLine,
} from './types/draft-order.type';

type OrderProgressRefs = {
  orderedQuantity: SQL<number>;
  receivedQuantity: SQL<number>;
};

@Injectable()
export class PurchaseOrdersService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly warehousesService: WarehousesService,
  ) {}

  async getPurchaseOrders(
    reqDto: GetPurchaseOrdersReqDto,
  ): Promise<OffsetPaginatedDto<PagePurchaseOrderResDto>> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;
    const materialKeyword = reqDto.materialKeyword
      ? `%${reqDto.materialKeyword}%`
      : undefined;

    const orderedAgg = orderAggregateSubquery(this.db);
    const receivedAgg = orderReceivedQuantitySubquery(this.db);
    const refs = this.buildProgressRefs(orderedAgg, receivedAgg);

    const where = and(
      keyword ? unaccentILike(purchaseOrders.code, keyword) : undefined,
      reqDto.supplierId
        ? eq(purchaseOrders.supplierId, reqDto.supplierId)
        : undefined,
      reqDto.quotationId
        ? eq(purchaseOrders.quotationId, reqDto.quotationId)
        : undefined,
      reqDto.status ? eq(purchaseOrders.status, reqDto.status) : undefined,
      reqDto.progress
        ? this.buildProgressCondition(refs, reqDto.progress)
        : undefined,
      reqDto.hasRemainingReceipt
        ? or(
            this.buildProgressCondition(refs, PurchaseOrderProgress.ORDERED),
            this.buildProgressCondition(refs, PurchaseOrderProgress.RECEIVING),
          )
        : undefined,
      reqDto.purchaseRequestId || materialKeyword
        ? exists(
            this.db
              .select({ one: sql`1` })
              .from(purchaseOrderItems)
              .innerJoin(
                purchaseRequestItems,
                eq(
                  purchaseRequestItems.id,
                  purchaseOrderItems.purchaseRequestItemId,
                ),
              )
              .innerJoin(items, eq(items.id, purchaseRequestItems.itemId))
              .where(
                and(
                  eq(purchaseOrderItems.purchaseOrderId, purchaseOrders.id),
                  reqDto.purchaseRequestId
                    ? eq(
                        purchaseRequestItems.purchaseRequestId,
                        reqDto.purchaseRequestId,
                      )
                    : undefined,
                  materialKeyword
                    ? or(
                        unaccentILike(items.name, materialKeyword),
                        unaccentILike(items.code, materialKeyword),
                      )
                    : undefined,
                ),
              ),
          )
        : undefined,
      reqDto.fromDate
        ? gte(purchaseOrders.orderDate, reqDto.fromDate)
        : undefined,
      reqDto.toDate
        ? lt(
            purchaseOrders.orderDate,
            new Date(reqDto.toDate.getTime() + 24 * 60 * 60 * 1000),
          )
        : undefined,
    );

    // Bước 1: lọc/phân trang trên bảng gốc (join 2 aggregate subquery), chưa hydrate quan hệ —
    // không lọc theo tiến độ (suy từ aggregate) được bằng `db.query.findMany` (relational query
    // API), nên phải tách 2 bước. `orderedQuantity`/`receivedQuantity` chỉ để tính `progress` ở
    // bước 3 (JS, không cần SQL CASE) — không lên response.
    const [idRows, countRows] = await Promise.all([
      this.db
        .select({
          id: purchaseOrders.id,
          itemCount: sql<number>`coalesce(${orderedAgg.itemCount}, 0)`.mapWith(
            Number,
          ),
          totalAmount:
            sql<number>`coalesce(${orderedAgg.totalAmount}, 0)`.mapWith(Number),
          orderedQuantity: refs.orderedQuantity,
          receivedQuantity: refs.receivedQuantity,
        })
        .from(purchaseOrders)
        .leftJoin(orderedAgg, eq(orderedAgg.purchaseOrderId, purchaseOrders.id))
        .leftJoin(
          receivedAgg,
          eq(receivedAgg.purchaseOrderId, purchaseOrders.id),
        )
        .where(where)
        .orderBy(desc(purchaseOrders.createdAt))
        .limit(reqDto.limit)
        .offset(reqDto.offset),
      this.db
        .select({ total: count() })
        .from(purchaseOrders)
        .leftJoin(orderedAgg, eq(orderedAgg.purchaseOrderId, purchaseOrders.id))
        .leftJoin(
          receivedAgg,
          eq(receivedAgg.purchaseOrderId, purchaseOrders.id),
        )
        .where(where),
    ]);

    const ids = idRows.map((row) => row.id);

    // Bước 2: hydrate quan hệ (relational query API) + gom PR nguồn — chỉ cho đúng trang hiện tại.
    // Mỗi await tách riêng (không gộp vào Promise.all) — cùng khuôn `aggregateRows` cũ của hàm
    // này: ternary `ids.length ? await … : []` bên trong Promise.all khiến TS suy luận sai kiểu
    // phần tử (mất kiểu cụ thể, sập về `any[]`).
    const entities = ids.length
      ? await this.db.query.purchaseOrders.findMany({
          where: inArray(purchaseOrders.id, ids),
          with: {
            supplier: true,
            quotation: true,
            assignedUser: true,
            receiptWarehouse: true,
            ordererBy: true,
            cancellerBy: true,
            creatorBy: true,
          },
        })
      : [];

    const purchaseRequestRows = ids.length
      ? await this.db
          .selectDistinct({
            purchaseOrderId: purchaseOrderItems.purchaseOrderId,
            id: purchaseRequests.id,
            code: purchaseRequests.code,
          })
          .from(purchaseOrderItems)
          .innerJoin(
            purchaseRequestItems,
            eq(
              purchaseRequestItems.id,
              purchaseOrderItems.purchaseRequestItemId,
            ),
          )
          .innerJoin(
            purchaseRequests,
            eq(purchaseRequests.id, purchaseRequestItems.purchaseRequestId),
          )
          .where(inArray(purchaseOrderItems.purchaseOrderId, ids))
      : [];

    const entityById = new Map(entities.map((entity) => [entity.id, entity]));
    const purchaseRequestsByOrderId = new Map<
      string,
      { id: string; code: string }[]
    >();
    for (const row of purchaseRequestRows) {
      const list = purchaseRequestsByOrderId.get(row.purchaseOrderId) ?? [];
      list.push({ id: row.id, code: row.code });
      purchaseRequestsByOrderId.set(row.purchaseOrderId, list);
    }

    // Giữ đúng thứ tự đã sắp/phân trang ở bước 1 — `findMany` không đảm bảo giữ thứ tự `inArray`.
    const rows = idRows.flatMap((row) => {
      const entity = entityById.get(row.id);
      if (!entity) return [];
      return [
        {
          ...entity,
          itemCount: row.itemCount,
          totalAmount: row.totalAmount,
          progress: this.resolveOrderProgress(
            entity.status,
            row.orderedQuantity,
            row.receivedQuantity,
          ),
          purchaseRequests: purchaseRequestsByOrderId.get(row.id) ?? [],
        },
      ];
    });

    return new OffsetPaginatedDto(
      plainToInstance(PagePurchaseOrderResDto, rows, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(countRows[0]?.total ?? 0, reqDto),
    );
  }

  /** Coalesce hai aggregate subquery về 0 — LEFT JOIN không khớp dòng nào (PO chưa có dòng vật tư
   * nào, hoặc chưa có phiếu nhập POSTED nào) thì các cột này null. Cùng khuôn
   * `PurchaseLedgerService.buildQuantityRefs`. */
  private buildProgressRefs(
    orderedAgg: ReturnType<typeof orderAggregateSubquery>,
    receivedAgg: ReturnType<typeof orderReceivedQuantitySubquery>,
  ): OrderProgressRefs {
    return {
      orderedQuantity:
        sql<number>`coalesce(${orderedAgg.orderedQuantity}, 0)`.mapWith(Number),
      receivedQuantity:
        sql<number>`coalesce(${receivedAgg.receivedQuantity}, 0)`.mapWith(
          Number,
        ),
    };
  }

  /** Cùng thứ tự ưu tiên với `buildProgressCondition` (sửa một cái phải sửa cái kia) — nhưng tính
   * bằng JS thuần, không phải SQL CASE: `progress` chỉ cần cho response, không cần select/sort
   * theo nó, nên không đáng để mapWith qua wire. */
  private resolveOrderProgress(
    status: PurchaseOrderStatus,
    orderedQuantity: number,
    receivedQuantity: number,
  ): PurchaseOrderProgress {
    if (status === PurchaseOrderStatus.CANCELLED) {
      return PurchaseOrderProgress.CANCELLED;
    }
    if (status === PurchaseOrderStatus.DRAFT) {
      return PurchaseOrderProgress.DRAFT;
    }
    if (orderedQuantity > 0 && receivedQuantity >= orderedQuantity) {
      return PurchaseOrderProgress.COMPLETED;
    }
    if (receivedQuantity > 0) {
      return PurchaseOrderProgress.RECEIVING;
    }
    return PurchaseOrderProgress.ORDERED;
  }

  /** Điều kiện lọc `WHERE` khớp đúng một giá trị `PurchaseOrderProgress` — mỗi nhánh loại trừ lẫn
   * nhau, phủ đúng logic của `resolveOrderProgress` (kể cả trường hợp biên `orderedQuantity = 0`). */
  private buildProgressCondition(
    refs: OrderProgressRefs,
    progress: PurchaseOrderProgress,
  ): SQL {
    switch (progress) {
      case PurchaseOrderProgress.CANCELLED:
        return eq(purchaseOrders.status, PurchaseOrderStatus.CANCELLED);
      case PurchaseOrderProgress.DRAFT:
        return eq(purchaseOrders.status, PurchaseOrderStatus.DRAFT);
      case PurchaseOrderProgress.COMPLETED:
        return sql`(
          ${purchaseOrders.status} = ${PurchaseOrderStatus.ORDERED}
          and ${refs.orderedQuantity} > 0
          and ${refs.receivedQuantity} >= ${refs.orderedQuantity}
        )`;
      case PurchaseOrderProgress.RECEIVING:
        return sql`(
          ${purchaseOrders.status} = ${PurchaseOrderStatus.ORDERED}
          and ${refs.receivedQuantity} > 0
          and not (
            ${refs.orderedQuantity} > 0
            and ${refs.receivedQuantity} >= ${refs.orderedQuantity}
          )
        )`;
      case PurchaseOrderProgress.ORDERED:
        return sql`(
          ${purchaseOrders.status} = ${PurchaseOrderStatus.ORDERED}
          and ${refs.receivedQuantity} = 0
        )`;
    }
  }

  async getPurchaseOrder(
    purchaseOrderId: string,
  ): Promise<PurchaseOrderResDto> {
    const order = await this.db.query.purchaseOrders.findFirst({
      where: eq(purchaseOrders.id, purchaseOrderId),
      with: {
        supplier: true,
        quotation: true,
        assignedUser: true,
        receiptWarehouse: true,
        ordererBy: true,
        cancellerBy: true,
        creatorBy: true,
        items: {
          with: {
            purchaseRequestItem: {
              with: { purchaseRequest: true, item: { with: { unit: true } } },
            },
          },
        },
      },
    });

    if (!order) {
      throw new AppException(ErrorCode.E121, HttpStatus.NOT_FOUND);
    }

    const receivedByItemId = await getReceivedQuantityByPurchaseOrderItemId(
      this.db,
      {
        purchaseOrderItemIds: order.items.map((item) => item.id),
        statuses: [InventoryDocumentStatus.POSTED],
      },
    );

    return plainToInstance(
      PurchaseOrderResDto,
      {
        ...order,
        items: order.items.map((item) => ({
          ...item,
          receivedQuantity: receivedByItemId.get(item.id) ?? 0,
        })),
      },
      { excludeExtraneousValues: true },
    );
  }

  /** Sinh PO Draft từ NCC thắng thầu của một RFQ — một NCC nhiều vật tư gộp chung một PO. Bắt
   * buộc truyền `tx` — chỉ gọi được từ transaction `approve`/`recall` của
   * `PurchaseQuotationsService` (`docs/workflows/rfq-approval.md`). */
  async createDraftOrdersFromQuotation(
    tx: DbTransaction,
    input: CreateDraftOrdersFromQuotationInput,
  ): Promise<void> {
    for (const [supplierId, lines] of input.linesBySupplierId) {
      const code = await this.generatePurchaseOrderCode(tx);
      const orderDate = new Date();
      const [order] = await tx
        .insert(purchaseOrders)
        .values({
          code,
          supplierId,
          quotationId: input.quotationId,
          orderDate,
          expectedDate: this.expectedDateFromLeadTime(orderDate, lines),
          createdBy: input.createdBy,
        })
        .returning({ id: purchaseOrders.id });

      await tx.insert(purchaseOrderItems).values(
        lines.map((line) => ({
          purchaseOrderId: order.id,
          purchaseRequestItemId: line.purchaseRequestItemId,
          quotationItemSupplierId: line.quotationItemSupplierId,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          quantityAdjustmentReason: line.quantityAdjustmentReason,
        })),
      );
    }
  }

  async updatePurchaseOrder(
    purchaseOrderId: string,
    reqDto: UpdatePurchaseOrderReqDto,
  ): Promise<void> {
    await this.ensurePurchaseOrderDraft(purchaseOrderId);

    if (reqDto.assignedUserId) {
      await this.ensureAssignedUserExists(reqDto.assignedUserId);
    }
    if (reqDto.receiptWarehouseId) {
      await this.warehousesService.ensureWarehouseActive(
        reqDto.receiptWarehouseId,
      );
    }

    await this.db
      .update(purchaseOrders)
      .set({ ...reqDto })
      .where(eq(purchaseOrders.id, purchaseOrderId));
  }

  async updatePurchaseOrderItem(
    purchaseOrderId: string,
    purchaseOrderItemId: string,
    reqDto: UpdatePurchaseOrderItemReqDto,
  ): Promise<void> {
    await this.ensurePurchaseOrderDraft(purchaseOrderId);

    const item = await this.db.query.purchaseOrderItems.findFirst({
      columns: { id: true },
      where: and(
        eq(purchaseOrderItems.id, purchaseOrderItemId),
        eq(purchaseOrderItems.purchaseOrderId, purchaseOrderId),
      ),
    });

    if (!item) {
      throw new AppException(ErrorCode.E123, HttpStatus.NOT_FOUND);
    }

    await this.db
      .update(purchaseOrderItems)
      .set({ ...reqDto })
      .where(eq(purchaseOrderItems.id, purchaseOrderItemId));
  }

  /** Xác nhận đặt hàng — `DRAFT → ORDERED`. Chặn nếu chưa có `expectedDate` (`E134`), chưa chọn
   * `receiptWarehouseId` (`E155`), chưa chọn `paymentTerm` (`E156` — cần để tính `dueDate` khi PO
   * đạt COMPLETED tự sinh yêu cầu thanh toán, `PaymentRequestsService.createIfOrderCompleted`),
   * hoặc còn dòng thiếu `unitPrice` (`E135`); `quantity` luôn > 0 sẵn (`CHECK` ở DB), không cần
   * kiểm lại. */
  async confirmPurchaseOrder(
    purchaseOrderId: string,
    userId: string,
  ): Promise<void> {
    await this.ensurePurchaseOrderDraft(purchaseOrderId);

    const order = await this.db.query.purchaseOrders.findFirst({
      columns: {
        expectedDate: true,
        receiptWarehouseId: true,
        paymentTerm: true,
      },
      where: eq(purchaseOrders.id, purchaseOrderId),
    });

    if (!order?.expectedDate) {
      throw new AppException(ErrorCode.E134, HttpStatus.BAD_REQUEST);
    }
    if (!order.receiptWarehouseId) {
      throw new AppException(ErrorCode.E155, HttpStatus.BAD_REQUEST);
    }
    if (!order.paymentTerm) {
      throw new AppException(ErrorCode.E156, HttpStatus.BAD_REQUEST);
    }

    const orderItems = await this.db.query.purchaseOrderItems.findMany({
      columns: { unitPrice: true },
      where: eq(purchaseOrderItems.purchaseOrderId, purchaseOrderId),
    });

    if (orderItems.some((item) => item.unitPrice === null)) {
      throw new AppException(ErrorCode.E135, HttpStatus.BAD_REQUEST);
    }

    await this.db
      .update(purchaseOrders)
      .set({
        status: PurchaseOrderStatus.ORDERED,
        orderedBy: userId,
        orderedAt: new Date(),
      })
      .where(eq(purchaseOrders.id, purchaseOrderId));
  }

  async cancelPurchaseOrder(
    purchaseOrderId: string,
    reqDto: CancelPurchaseOrderReqDto,
    userId: string,
  ): Promise<void> {
    await this.ensurePurchaseOrderCancellable(purchaseOrderId);

    const hasPostedReceipts =
      await this.hasPostedReceiptsForOrder(purchaseOrderId);
    if (hasPostedReceipts) {
      throw new AppException(ErrorCode.E124, HttpStatus.CONFLICT);
    }

    await this.db
      .update(purchaseOrders)
      .set({
        status: PurchaseOrderStatus.CANCELLED,
        cancelledBy: userId,
        cancelledAt: new Date(),
        cancellationReason: reqDto.reason,
      })
      .where(eq(purchaseOrders.id, purchaseOrderId));
  }

  private async ensurePurchaseOrderDraft(purchaseOrderId: string) {
    const order = await this.db.query.purchaseOrders.findFirst({
      columns: { id: true, status: true },
      where: eq(purchaseOrders.id, purchaseOrderId),
    });

    if (!order) {
      throw new AppException(ErrorCode.E121, HttpStatus.NOT_FOUND);
    }

    if (order.status !== PurchaseOrderStatus.DRAFT) {
      throw new AppException(ErrorCode.E122, HttpStatus.CONFLICT);
    }
  }

  /** `cancel` hợp lệ từ cả `DRAFT` lẫn `ORDERED` (khác `ensurePurchaseOrderDraft`, chỉ chặn khi đã
   * `CANCELLED`), khớp lifecycle `docs/domains/purchasing.md`. */
  private async ensurePurchaseOrderCancellable(purchaseOrderId: string) {
    const order = await this.db.query.purchaseOrders.findFirst({
      columns: { id: true, status: true },
      where: eq(purchaseOrders.id, purchaseOrderId),
    });

    if (!order) {
      throw new AppException(ErrorCode.E121, HttpStatus.NOT_FOUND);
    }

    if (order.status === PurchaseOrderStatus.CANCELLED) {
      throw new AppException(ErrorCode.E122, HttpStatus.CONFLICT);
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
      throw new AppException(ErrorCode.E136, HttpStatus.NOT_FOUND);
    }
  }

  /** Đơn mua đã có phiếu nhập `POSTED` nối tới thì không huỷ được nữa (`E124`) — hàng đã về kho. */
  private async hasPostedReceiptsForOrder(
    purchaseOrderId: string,
  ): Promise<boolean> {
    const [{ total }] = await this.db
      .select({ total: count() })
      .from(inventoryReceipts)
      .where(
        and(
          eq(inventoryReceipts.purchaseOrderId, purchaseOrderId),
          eq(inventoryReceipts.status, InventoryDocumentStatus.POSTED),
        ),
      );

    return total > 0;
  }

  private async generatePurchaseOrderCode(tx: DbTransaction): Promise<string> {
    const [totalRows] = await tx
      .select({ total: count() })
      .from(purchaseOrders);
    return `PO-${String((totalRows?.total ?? 0) + 1).padStart(5, '0')}`;
  }

  /** Ngày giao dự kiến = ngày đặt + leadtime dài nhất trong nhóm dòng cùng NCC — một PO chỉ có một
   * ngày giao, nên lấy dòng chờ lâu nhất. `null` nếu không dòng nào có leadtime từ báo giá. */
  private expectedDateFromLeadTime(
    orderDate: Date,
    lines: PurchaseOrderDraftLine[],
  ): Date | null {
    const leadTimes = lines
      .map((line) => line.leadTimeDays)
      .filter((leadTimeDays) => leadTimeDays !== null);

    if (!leadTimes.length) {
      return null;
    }

    const maxLeadTimeDays = Math.max(...leadTimes);
    return new Date(
      orderDate.getTime() + maxLeadTimeDays * 24 * 60 * 60 * 1000,
    );
  }

  async hasOrderedOrdersForQuotation(quotationId: string): Promise<boolean> {
    const [{ total }] = await this.db
      .select({ total: count() })
      .from(purchaseOrders)
      .where(
        and(
          eq(purchaseOrders.quotationId, quotationId),
          eq(purchaseOrders.status, PurchaseOrderStatus.ORDERED),
        ),
      );

    return total > 0;
  }

  /** Xoá PO Draft sinh từ một RFQ khi `recall` — chỉ xoá `DRAFT`, gọi sau khi
   * `hasOrderedOrdersForQuotation` đã xác nhận không còn PO nào `ORDERED`. Bắt buộc truyền `tx`,
   * cùng transaction với việc bỏ chọn thắng thầu ở `PurchaseQuotationsService.recallQuotation`. */
  async deleteDraftOrdersByQuotation(
    tx: DbTransaction,
    quotationId: string,
  ): Promise<void> {
    await tx
      .delete(purchaseOrders)
      .where(
        and(
          eq(purchaseOrders.quotationId, quotationId),
          eq(purchaseOrders.status, PurchaseOrderStatus.DRAFT),
        ),
      );
  }
}
