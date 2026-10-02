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
  ne,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';

import { OffsetPaginationDto } from '../../common/dto/offset-pagination/offset-pagination.dto';
import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import {
  DocumentType,
  generateDocumentSequence,
} from '../../common/utils/document-sequence.util';
import { hasFields } from '../../common/utils/object.util';
import { unaccentILike } from '../../common/utils/search.util';
import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import type { Database, DbTransaction } from '../../database/database.type';
import { vnToday } from '../../database/vn-date.util';
import {
  InventoryDocumentStatus,
  inventoryReceipts,
  items,
  purchaseOrderItems,
  purchaseOrders,
  PurchaseQuotationStatus,
  purchaseQuotationItemSuppliers,
  purchaseQuotationItems,
  purchaseQuotations,
  purchaseRequestItems,
  purchaseRequests,
  PurchaseOrderStatus,
  users,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { PaymentRequestsService } from '../payment-requests/payment-requests.service';
import { CancelPurchaseOrderReqDto } from './dto/cancel-purchase-order.req.dto';
import { ClosePurchaseOrderReqDto } from './dto/close-purchase-order.req.dto';
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
  CreatePendingOrdersFromQuotationInput,
  PurchaseOrderPendingLine,
} from './types/pending-order.type';

type OrderProgressRefs = {
  orderedQuantity: SQL<number>;
  receivedQuantity: SQL<number>;
};

type PurchaseOrderDetailRow = Awaited<
  ReturnType<PurchaseOrdersService['findPurchaseOrderDetail']>
>;

/** Một hành động trên PO có cho phép không, và nếu không thì chứng từ nào đang chặn. */
type ActionAvailability = {
  isAllowed: boolean;
  blockingDocuments: { id: string; code: string }[];
};

type CancellableOrder = {
  id: string;
  code: string;
  quotationId: string | null;
  quotation: { status: PurchaseQuotationStatus } | null;
};

/** Dòng nhận thiếu (nhận < đặt) và tổng SL đã nhận — dùng chung cho `canClose` ở chi tiết và
 * điều kiện đóng sớm, để UI và ghi không lệch nhau. */
function summarizeReceivedQuantities(
  lines: { id: string; quantity: number }[],
  receivedQuantityByItemId: Map<string, number>,
) {
  return {
    underReceivedLines: lines.filter(
      (line) => (receivedQuantityByItemId.get(line.id) ?? 0) < line.quantity,
    ),
    totalReceivedQuantity: lines.reduce(
      (sum, line) => sum + (receivedQuantityByItemId.get(line.id) ?? 0),
      0,
    ),
  };
}

@Injectable()
export class PurchaseOrdersService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly paymentRequestsService: PaymentRequestsService,
  ) {}

  async getPurchaseOrders(
    reqDto: GetPurchaseOrdersReqDto,
  ): Promise<OffsetPaginatedDto<PagePurchaseOrderResDto>> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;
    const directKeyword = reqDto.directKeyword
      ? `%${reqDto.directKeyword}%`
      : undefined;

    const orderedAgg = orderAggregateSubquery(this.db);
    const receivedAgg = orderReceivedQuantitySubquery(this.db);
    const refs = this.buildProgressRefs(orderedAgg, receivedAgg);

    const hasItemFilters = Boolean(reqDto.purchaseRequestId || directKeyword);

    const where = and(
      keyword
        ? or(
            unaccentILike(purchaseOrders.code, keyword),
            exists(
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
                .innerJoin(
                  purchaseRequests,
                  eq(
                    purchaseRequests.id,
                    purchaseRequestItems.purchaseRequestId,
                  ),
                )
                .where(
                  and(
                    eq(purchaseOrderItems.purchaseOrderId, purchaseOrders.id),
                    or(
                      unaccentILike(items.name, keyword),
                      unaccentILike(items.code, keyword),
                      unaccentILike(purchaseRequests.code, keyword),
                    ),
                  ),
                ),
            ),
          )
        : undefined,
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
      hasItemFilters
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
                  directKeyword
                    ? or(
                        unaccentILike(items.name, directKeyword),
                        unaccentILike(items.code, directKeyword),
                      )
                    : undefined,
                ),
              ),
          )
        : undefined,
      reqDto.startDate
        ? gte(purchaseOrders.orderDate, reqDto.startDate)
        : undefined,
      reqDto.endDate
        ? lt(
            purchaseOrders.orderDate,
            new Date(reqDto.endDate.getTime() + 24 * 60 * 60 * 1000),
          )
        : undefined,
    );

    // Bước 1: lọc/phân trang trên bảng gốc (join 2 aggregate subquery), chưa hydrate quan hệ —
    // không lọc theo tiến độ (suy từ aggregate) được bằng `db.query.findMany` (relational query
    // API), nên phải tách 2 bước. `orderedQuantity`/`receivedQuantity` chỉ để tính `progress` ở
    // bước 3 (JS, không cần SQL CASE) — không lên response.
    const [idRows, [{ total }]] = await Promise.all([
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
      new OffsetPaginationDto(total, reqDto),
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
    if (status === PurchaseOrderStatus.PENDING_CONFIRMATION) {
      return PurchaseOrderProgress.PENDING_CONFIRMATION;
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
      case PurchaseOrderProgress.PENDING_CONFIRMATION:
        return eq(
          purchaseOrders.status,
          PurchaseOrderStatus.PENDING_CONFIRMATION,
        );
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
    const order = await this.findPurchaseOrderDetail(purchaseOrderId);

    const receivedQuantityByItemId =
      await getReceivedQuantityByPurchaseOrderItemId(this.db, {
        purchaseOrderItemIds: order.items.map((item) => item.id),
        statuses: [InventoryDocumentStatus.POSTED],
      });
    const actions = await this.resolveAvailableActions(
      order,
      receivedQuantityByItemId,
    );

    return plainToInstance(
      PurchaseOrderResDto,
      {
        ...order,
        ...actions,
        progress: this.resolveOrderProgress(
          order.status,
          order.items.reduce((sum, item) => sum + item.quantity, 0),
          order.items.reduce(
            (sum, item) => sum + (receivedQuantityByItemId.get(item.id) ?? 0),
            0,
          ),
        ),
        quotationStatus: order.quotation?.status ?? null,
        items: order.items.map((item) => ({
          ...item,
          receivedQuantity: receivedQuantityByItemId.get(item.id) ?? 0,
        })),
      },
      { excludeExtraneousValues: true },
    );
  }

  private async findPurchaseOrderDetail(purchaseOrderId: string) {
    const order = await this.db.query.purchaseOrders.findFirst({
      where: eq(purchaseOrders.id, purchaseOrderId),
      with: {
        supplier: true,
        quotation: true,
        assignedUser: true,
        ordererBy: true,
        cancellerBy: true,
        closerBy: true,
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

    return order;
  }

  /** Cho UI biết PO này có đóng sớm / huỷ kèm mở lại RFQ được không và cái gì đang chặn. Dùng đúng
   * các hàm kiểm của bước ghi (`summarizeReceivedQuantities`, `findUnpostedReceipts`, `findOtherOrderedOrders`)
   * để UI và bước ghi không lệch nhau. */
  private async resolveAvailableActions(
    order: PurchaseOrderDetailRow,
    receivedQuantityByItemId: Map<string, number>,
  ) {
    const close = await this.resolveEarlyCloseAvailability(
      order,
      receivedQuantityByItemId,
    );
    const reopen = await this.resolveQuotationReopenAvailability(order);

    return {
      canClose: close.isAllowed,
      closeBlockedBy: close.blockingDocuments,
      canReopenQuotation: reopen.isAllowed,
      reopenBlockedBy: reopen.blockingDocuments,
    };
  }

  /** Đóng sớm: PO `ORDERED` chưa đóng, nhận một phần, và không còn phiếu nhập chưa ghi sổ. */
  private async resolveEarlyCloseAvailability(
    order: PurchaseOrderDetailRow,
    receivedQuantityByItemId: Map<string, number>,
  ): Promise<ActionAvailability> {
    const { underReceivedLines, totalReceivedQuantity } =
      summarizeReceivedQuantities(order.items, receivedQuantityByItemId);
    const isOrderOpen =
      order.status === PurchaseOrderStatus.ORDERED && !order.closedAt;
    const isPartiallyReceived =
      underReceivedLines.length > 0 && totalReceivedQuantity > 0;
    if (!isOrderOpen || !isPartiallyReceived) {
      return { isAllowed: false, blockingDocuments: [] };
    }

    const blockingDocuments = await this.findUnpostedReceipts(
      this.db,
      order.id,
    );
    return { isAllowed: blockingDocuments.length === 0, blockingDocuments };
  }

  /** Huỷ kèm mở lại RFQ: PO chưa huỷ, RFQ nguồn còn `APPROVED`, và không còn PO `ORDERED` khác. */
  private async resolveQuotationReopenAvailability(
    order: PurchaseOrderDetailRow,
  ): Promise<ActionAvailability> {
    const isQuotationReopenable =
      order.status !== PurchaseOrderStatus.CANCELLED &&
      order.quotation?.status === PurchaseQuotationStatus.APPROVED;
    if (!order.quotationId || !isQuotationReopenable) {
      return { isAllowed: false, blockingDocuments: [] };
    }

    const blockingDocuments = await this.findOtherOrderedOrders(
      this.db,
      order.quotationId,
      order.id,
    );
    return { isAllowed: blockingDocuments.length === 0, blockingDocuments };
  }

  /** Sinh PO Chờ xác nhận từ NCC thắng thầu của một RFQ — một NCC nhiều vật tư gộp chung một PO. Bắt
   * buộc truyền `tx` — chỉ gọi được từ transaction `approve`/`cancel` của
   * `PurchaseQuotationsService` (`docs/workflows/rfq-approval.md`). */
  async createPendingOrdersFromQuotation(
    tx: DbTransaction,
    input: CreatePendingOrdersFromQuotationInput,
  ): Promise<void> {
    for (const [supplierId, lines] of input.linesBySupplierId) {
      const code = await this.generatePurchaseOrderCode(tx);
      const orderDate = vnToday();
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
    await this.ensurePurchaseOrderPendingConfirmation(purchaseOrderId);

    if (reqDto.assignedUserId) {
      await this.ensureAssignedUserExists(reqDto.assignedUserId);
    }

    if (hasFields(reqDto)) {
      await this.db
        .update(purchaseOrders)
        .set(reqDto)
        .where(eq(purchaseOrders.id, purchaseOrderId));
    }
  }

  async updatePurchaseOrderItem(
    purchaseOrderId: string,
    purchaseOrderItemId: string,
    reqDto: UpdatePurchaseOrderItemReqDto,
  ): Promise<void> {
    await this.ensurePurchaseOrderPendingConfirmation(purchaseOrderId);

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

    if (hasFields(reqDto)) {
      await this.db
        .update(purchaseOrderItems)
        .set(reqDto)
        .where(eq(purchaseOrderItems.id, purchaseOrderItemId));
    }
  }

  /** Xác nhận đặt hàng — `PENDING_CONFIRMATION → ORDERED`. Chặn nếu chưa có `expectedDate` (`E134`), chưa chọn
   * `paymentTerm` (`E156` — cần để tính `dueDate` khi PO đạt COMPLETED tự sinh yêu cầu thanh
   * toán, `PaymentRequestsService.createIfOrderCompleted`), hoặc còn dòng thiếu `unitPrice`
   * (`E135`); `quantity` luôn > 0 sẵn (`CHECK` ở DB), không cần kiểm lại. */
  async confirmPurchaseOrder(
    purchaseOrderId: string,
    userId: string,
  ): Promise<void> {
    await this.ensurePurchaseOrderPendingConfirmation(purchaseOrderId);

    const order = await this.db.query.purchaseOrders.findFirst({
      columns: {
        expectedDate: true,
        paymentTerm: true,
      },
      where: eq(purchaseOrders.id, purchaseOrderId),
    });

    if (!order?.expectedDate) {
      throw new AppException(ErrorCode.E134, HttpStatus.BAD_REQUEST);
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
        assignedUserId: sql`COALESCE(${purchaseOrders.assignedUserId}, ${userId})`,
      })
      .where(eq(purchaseOrders.id, purchaseOrderId));
  }

  async cancelPurchaseOrder(
    purchaseOrderId: string,
    reqDto: CancelPurchaseOrderReqDto,
    userId: string,
  ): Promise<void> {
    const order = await this.ensurePurchaseOrderCancellable(purchaseOrderId);

    if (await this.hasPostedReceiptsForOrder(purchaseOrderId)) {
      throw new AppException(ErrorCode.E124, HttpStatus.CONFLICT);
    }

    await this.db.transaction(async (tx) => {
      await this.cancelLinkedDocuments(tx, order, userId);

      await tx
        .update(purchaseOrders)
        .set({
          status: PurchaseOrderStatus.CANCELLED,
          cancelledBy: userId,
          cancelledAt: new Date(),
          cancellationReason: reqDto.reason,
        })
        .where(eq(purchaseOrders.id, purchaseOrderId));

      await this.settleQuotationAfterCancel(tx, order, reqDto, userId);
    });
  }

  /** YCTT còn `PENDING` huỷ theo (đã `PAID` thì `E284`); phiếu nhập nháp chưa chạm kho/IQC cũng huỷ
   * theo. Phiếu đã `confirm` giữ nguyên nhưng không còn `confirm`/`post` được (`E145`). */
  private async cancelLinkedDocuments(
    tx: DbTransaction,
    order: { id: string; code: string },
    userId: string,
  ): Promise<void> {
    await this.paymentRequestsService.cancelForOrder(
      tx,
      order.id,
      userId,
      `PO ${order.code} bị huỷ`,
    );

    await tx
      .update(inventoryReceipts)
      .set({ status: InventoryDocumentStatus.CANCELLED })
      .where(
        and(
          eq(inventoryReceipts.purchaseOrderId, order.id),
          eq(inventoryReceipts.status, InventoryDocumentStatus.DRAFT),
        ),
      );
  }

  /** Số phận của RFQ sinh ra PO vừa huỷ — chỉ xét khi RFQ còn `APPROVED`: mở lại để sửa giá
   * (`reopenQuotation`), hoặc "không mua nữa" thì huỷ RFQ nếu đây là PO hoạt động cuối cùng. */
  private async settleQuotationAfterCancel(
    tx: DbTransaction,
    order: CancellableOrder,
    reqDto: CancelPurchaseOrderReqDto,
    userId: string,
  ): Promise<void> {
    const quotationId = order.quotationId;
    if (
      !quotationId ||
      order.quotation?.status !== PurchaseQuotationStatus.APPROVED
    ) {
      return;
    }

    if (reqDto.reopenQuotation === true) {
      // Kiểm trong transaction; throw → rollback cả việc huỷ PO.
      const blockers = await this.findOtherOrderedOrders(
        tx,
        quotationId,
        order.id,
      );
      if (blockers.length) {
        throw new AppException(ErrorCode.E133, HttpStatus.CONFLICT);
      }
      await this.revertQuotationToDraft(tx, quotationId);
      return;
    }

    // Nếu RFQ cứ `APPROVED`, `quotedQuantity` vẫn tính nó và dòng đề xuất kẹt ở "Đang báo giá".
    if (await this.hasActiveOrders(tx, quotationId)) {
      return;
    }
    await tx
      .update(purchaseQuotations)
      .set({
        status: PurchaseQuotationStatus.CANCELLED,
        cancelledBy: userId,
        cancelledAt: new Date(),
        cancellationReason: `Huỷ đơn mua ${order.code}: ${reqDto.reason}`,
      })
      .where(eq(purchaseQuotations.id, quotationId));
  }

  /** RFQ còn PO nào chưa huỷ (chờ xác nhận hoặc đã đặt). */
  private async hasActiveOrders(
    executor: Database | DbTransaction,
    quotationId: string,
  ): Promise<boolean> {
    const [{ total }] = await executor
      .select({ total: count() })
      .from(purchaseOrders)
      .where(
        and(
          eq(purchaseOrders.quotationId, quotationId),
          ne(purchaseOrders.status, PurchaseOrderStatus.CANCELLED),
        ),
      );

    return total > 0;
  }

  /** Đưa RFQ `APPROVED` về `DRAFT`: xoá PO chờ xác nhận còn lại, bỏ chọn NCC thắng thầu. Dùng chung
   * cho huỷ PO kèm `reopenQuotation` (nằm ở đây vì
   * `PurchaseQuotationsService` đã phụ thuộc service này, chiều ngược lại sẽ thành vòng). */
  async revertQuotationToDraft(
    tx: DbTransaction,
    quotationId: string,
  ): Promise<void> {
    await this.deletePendingOrdersByQuotation(tx, quotationId);

    await tx
      .update(purchaseQuotationItemSuppliers)
      .set({ selectedBy: null, selectedAt: null })
      .where(
        inArray(
          purchaseQuotationItemSuppliers.quotationItemId,
          tx
            .select({ id: purchaseQuotationItems.id })
            .from(purchaseQuotationItems)
            .where(eq(purchaseQuotationItems.quotationId, quotationId)),
        ),
      );

    await tx
      .update(purchaseQuotations)
      .set({
        status: PurchaseQuotationStatus.DRAFT,
        approvedBy: null,
        approvedAt: null,
      })
      .where(eq(purchaseQuotations.id, quotationId));
  }

  /** PO `ORDERED` khác của cùng RFQ — chặn mở lại RFQ (`E133`) và cho UI biết đơn nào đang chặn. */
  private findOtherOrderedOrders(
    executor: Database | DbTransaction,
    quotationId: string,
    excludeOrderId: string,
  ): Promise<{ id: string; code: string }[]> {
    return executor
      .select({ id: purchaseOrders.id, code: purchaseOrders.code })
      .from(purchaseOrders)
      .where(
        and(
          eq(purchaseOrders.quotationId, quotationId),
          eq(purchaseOrders.status, PurchaseOrderStatus.ORDERED),
          ne(purchaseOrders.id, excludeOrderId),
        ),
      );
  }

  /** Đóng sớm PO nhận một phần — hạ SL từng dòng về số đã nhập thực (đã trừ hàng trả NCC) để mọi nơi
   * tính theo SL đặt (tiến độ PO, sổ cái, tổng tiền) tự đúng; dòng nhận 0 bị xoá (FK phiếu nhập
   * `set null`). PO giữ `ORDERED`, đánh dấu bằng `closedAt`. Sau đó thử sinh YCTT theo số đã nhập.
   * Chặn khi còn phiếu nhập chưa ghi sổ (`E285`) hoặc không có gì để đóng (`E286`). */
  async closePurchaseOrder(
    purchaseOrderId: string,
    reqDto: ClosePurchaseOrderReqDto,
    userId: string,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await this.lockOrderForEarlyClose(tx, purchaseOrderId);

      const { lines, receivedQuantityByItemId } =
        await this.loadLinesWithReceivedQuantity(tx, purchaseOrderId);
      const { underReceivedLines, totalReceivedQuantity } =
        summarizeReceivedQuantities(lines, receivedQuantityByItemId);
      if (!underReceivedLines.length || totalReceivedQuantity <= 0) {
        throw new AppException(ErrorCode.E286, HttpStatus.BAD_REQUEST);
      }

      await this.reduceLinesToReceivedQuantity(
        tx,
        underReceivedLines,
        receivedQuantityByItemId,
        reqDto.reason,
      );

      await tx
        .update(purchaseOrders)
        .set({
          closedBy: userId,
          closedAt: new Date(),
          closureReason: reqDto.reason,
        })
        .where(eq(purchaseOrders.id, purchaseOrderId));

      await this.paymentRequestsService.createIfOrderCompleted(
        tx,
        purchaseOrderId,
      );
    });
  }

  /** Khoá dòng PO rồi kiểm điều kiện đóng: `ORDERED`, chưa đóng (`E122`), không còn phiếu nhập
   * chưa ghi sổ (`E285`). */
  private async lockOrderForEarlyClose(
    tx: DbTransaction,
    purchaseOrderId: string,
  ): Promise<void> {
    const [order] = await tx
      .select({
        status: purchaseOrders.status,
        closedAt: purchaseOrders.closedAt,
      })
      .from(purchaseOrders)
      .where(eq(purchaseOrders.id, purchaseOrderId))
      .for('update');

    if (!order) {
      throw new AppException(ErrorCode.E121, HttpStatus.NOT_FOUND);
    }
    if (order.status !== PurchaseOrderStatus.ORDERED || order.closedAt) {
      throw new AppException(ErrorCode.E122, HttpStatus.CONFLICT);
    }
    if ((await this.findUnpostedReceipts(tx, purchaseOrderId)).length) {
      throw new AppException(ErrorCode.E285, HttpStatus.CONFLICT);
    }
  }

  /** Dòng PO kèm SL đã nhận (phiếu `POSTED`, đã trừ hàng trả NCC). */
  private async loadLinesWithReceivedQuantity(
    tx: DbTransaction,
    purchaseOrderId: string,
  ) {
    const lines = await tx
      .select({
        id: purchaseOrderItems.id,
        quantity: purchaseOrderItems.quantity,
      })
      .from(purchaseOrderItems)
      .where(eq(purchaseOrderItems.purchaseOrderId, purchaseOrderId));

    const receivedQuantityByItemId =
      await getReceivedQuantityByPurchaseOrderItemId(tx, {
        purchaseOrderItemIds: lines.map((line) => line.id),
        statuses: [InventoryDocumentStatus.POSTED],
      });

    return { lines, receivedQuantityByItemId };
  }

  /** Dòng chưa nhận gì bị xoá (FK phiếu nhập `set null`); dòng nhận một phần hạ SL về số đã nhận
   * và ghi lý do vào `quantityAdjustmentReason` (cột 500 ký tự, cắt nếu dài). */
  private async reduceLinesToReceivedQuantity(
    tx: DbTransaction,
    underReceivedLines: { id: string; quantity: number }[],
    receivedQuantityByItemId: Map<string, number>,
    reason: string,
  ): Promise<void> {
    const notReceivedLineIds = underReceivedLines
      .filter((line) => !receivedQuantityByItemId.get(line.id))
      .map((line) => line.id);
    if (notReceivedLineIds.length) {
      await tx
        .delete(purchaseOrderItems)
        .where(inArray(purchaseOrderItems.id, notReceivedLineIds));
    }

    for (const line of underReceivedLines) {
      const received = receivedQuantityByItemId.get(line.id);
      if (!received) continue;

      const note = `Đóng sớm: đặt ${line.quantity}, nhận ${received}. ${reason}`;
      await tx
        .update(purchaseOrderItems)
        .set({
          quantity: received,
          quantityAdjustmentReason: note.slice(0, 500),
        })
        .where(eq(purchaseOrderItems.id, line.id));
    }
  }

  /** Phiếu nhập của PO chưa ghi sổ cũng chưa huỷ — chặn đóng sớm vì SL chốt phải dựa trên hàng đã
   * ghi sổ. */
  private async findUnpostedReceipts(
    executor: Database | DbTransaction,
    purchaseOrderId: string,
  ): Promise<{ id: string; code: string }[]> {
    return executor
      .select({ id: inventoryReceipts.id, code: inventoryReceipts.code })
      .from(inventoryReceipts)
      .where(
        and(
          eq(inventoryReceipts.purchaseOrderId, purchaseOrderId),
          inArray(inventoryReceipts.status, [
            InventoryDocumentStatus.DRAFT,
            InventoryDocumentStatus.PENDING_RECEIPT,
            InventoryDocumentStatus.PENDING_IQC,
            InventoryDocumentStatus.IQC_COMPLETED,
          ]),
        ),
      );
  }

  private async ensurePurchaseOrderPendingConfirmation(
    purchaseOrderId: string,
  ) {
    const order = await this.db.query.purchaseOrders.findFirst({
      columns: { id: true, status: true },
      where: eq(purchaseOrders.id, purchaseOrderId),
    });

    if (!order) {
      throw new AppException(ErrorCode.E121, HttpStatus.NOT_FOUND);
    }

    if (order.status !== PurchaseOrderStatus.PENDING_CONFIRMATION) {
      throw new AppException(ErrorCode.E122, HttpStatus.CONFLICT);
    }
  }

  /** `cancel` hợp lệ từ cả `PENDING_CONFIRMATION` lẫn `ORDERED` (khác `ensurePurchaseOrderPendingConfirmation`, chỉ chặn khi đã
   * `CANCELLED`), khớp lifecycle `docs/domains/purchasing.md`. */
  private async ensurePurchaseOrderCancellable(purchaseOrderId: string) {
    const order = await this.db.query.purchaseOrders.findFirst({
      columns: { id: true, status: true, code: true, quotationId: true },
      with: { quotation: { columns: { status: true } } },
      where: eq(purchaseOrders.id, purchaseOrderId),
    });

    if (!order) {
      throw new AppException(ErrorCode.E121, HttpStatus.NOT_FOUND);
    }

    if (order.status === PurchaseOrderStatus.CANCELLED) {
      throw new AppException(ErrorCode.E122, HttpStatus.CONFLICT);
    }

    return order;
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
    const sequence = await generateDocumentSequence(
      tx,
      DocumentType.PURCHASE_ORDER,
    );

    return `DMH-${String(sequence).padStart(5, '0')}`;
  }

  /** Ngày giao dự kiến = ngày đặt + leadtime dài nhất trong nhóm dòng cùng NCC — một PO chỉ có một
   * ngày giao, nên lấy dòng chờ lâu nhất. `null` nếu không dòng nào có leadtime từ báo giá. */
  private expectedDateFromLeadTime(
    orderDate: Date,
    lines: PurchaseOrderPendingLine[],
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

  /** Xoá PO Chờ xác nhận sinh từ một RFQ khi huỷ RFQ — chỉ xoá `PENDING_CONFIRMATION`, gọi sau khi
   * `hasOrderedOrdersForQuotation` đã xác nhận không còn PO nào `ORDERED`. Bắt buộc truyền `tx`,
   * cùng transaction với việc đổi trạng thái RFQ ở `PurchaseQuotationsService.cancelQuotation`. */
  async deletePendingOrdersByQuotation(
    tx: DbTransaction,
    quotationId: string,
  ): Promise<void> {
    await tx
      .delete(purchaseOrders)
      .where(
        and(
          eq(purchaseOrders.quotationId, quotationId),
          eq(purchaseOrders.status, PurchaseOrderStatus.PENDING_CONFIRMATION),
        ),
      );
  }
}
