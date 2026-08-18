import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import {
  and,
  count,
  desc,
  eq,
  getTableColumns,
  gte,
  lt,
  or,
  sql,
} from 'drizzle-orm';

import { OffsetPaginationDto } from '../../common/dto/offset-pagination/offset-pagination.dto';
import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { unaccentILike } from '../../common/utils/search.util';
import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import type { Database, DbTransaction } from '../../database/database.type';
import {
  InventoryDocumentStatus,
  PaymentRequestStatus,
  PaymentTerm,
  paymentRequests,
  purchaseOrders,
  suppliers,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import {
  getReceivedQuantityByPurchaseOrderItemId,
  orderAggregateSubquery,
  orderReceivedQuantitySubquery,
} from '../purchase-orders/purchase-orders.query';
import { GetPaymentRequestsReqDto } from './dto/get-payment-requests.req.dto';
import { PagePaymentRequestResDto } from './dto/page-payment-request.res.dto';
import { PaymentRequestResDto } from './dto/payment-request.res.dto';

/** Số ngày tính hạn thanh toán từ `orderDate` của PO — `createIfOrderCompleted` là consumer thật
 * đầu tiên của `purchase_orders.paymentTerm`. */
const PAYMENT_TERM_DAYS: Record<PaymentTerm, number> = {
  [PaymentTerm.IMMEDIATE]: 0,
  [PaymentTerm.NET_15]: 15,
  [PaymentTerm.NET_30]: 30,
  [PaymentTerm.NET_60]: 60,
};

@Injectable()
export class PaymentRequestsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async getPaymentRequests(
    reqDto: GetPaymentRequestsReqDto,
  ): Promise<OffsetPaginatedDto<PagePaymentRequestResDto>> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;
    const poCodeKeyword = reqDto.poCode ? `%${reqDto.poCode}%` : undefined;

    const where = and(
      keyword
        ? or(
            unaccentILike(paymentRequests.code, keyword),
            unaccentILike(purchaseOrders.code, keyword),
          )
        : undefined,
      poCodeKeyword
        ? unaccentILike(purchaseOrders.code, poCodeKeyword)
        : undefined,
      reqDto.supplierId
        ? eq(purchaseOrders.supplierId, reqDto.supplierId)
        : undefined,
      reqDto.status ? eq(paymentRequests.status, reqDto.status) : undefined,
      reqDto.fromDate
        ? gte(paymentRequests.createdAt, reqDto.fromDate)
        : undefined,
      // Biên trên loại trừ — `toDate` parse ra nửa đêm UTC, `lte` sẽ bỏ sót cùng ngày.
      reqDto.toDate
        ? lt(
            paymentRequests.createdAt,
            new Date(reqDto.toDate.getTime() + 24 * 60 * 60 * 1000),
          )
        : undefined,
    );

    // `.select()` thay vì relational query — `purchaseOrders`/`paymentRequests` collapse type ngay
    // ở `with:` 1 cấp (Drizzle relational query type-inference, không phải do lồng sâu). Join
    // thẳng, DTO (`PickType` trên Ref DTO) tự lọc field nào thật sự lộ ra ngoài.
    const [rows, countRows] = await Promise.all([
      this.db
        .select({
          id: paymentRequests.id,
          code: paymentRequests.code,
          purchaseOrder: getTableColumns(purchaseOrders),
          supplier: getTableColumns(suppliers),
          poValue: paymentRequests.requestValue,
          requestValue: paymentRequests.requestValue,
          status: paymentRequests.status,
          createdAt: paymentRequests.createdAt,
        })
        .from(paymentRequests)
        .innerJoin(
          purchaseOrders,
          eq(purchaseOrders.id, paymentRequests.purchaseOrderId),
        )
        .innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
        .where(where)
        .limit(reqDto.limit)
        .offset(reqDto.offset)
        .orderBy(desc(paymentRequests.createdAt)),
      // Không join `suppliers` — `where` chỉ tham chiếu `purchaseOrders` (`supplierId` lọc trên
      // FK, không phải bảng `suppliers`), join thêm bảng này vào đây chỉ tốn công vô ích.
      this.db
        .select({ total: count() })
        .from(paymentRequests)
        .innerJoin(
          purchaseOrders,
          eq(purchaseOrders.id, paymentRequests.purchaseOrderId),
        )
        .where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(PagePaymentRequestResDto, rows, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(countRows[0]?.total ?? 0, reqDto),
    );
  }

  /** Giữ relational query (không chuyển `.select()` như `getPaymentRequests` ở trên) —
   * `purchaseOrder.items` là quan hệ 1-nhiều và cần tự alias bảng `users` 3 lần
   * (`paidByUser`/`cancelledByUser`/`creatorBy`) nếu viết tay bằng `.select()`. */
  async getPaymentRequest(
    paymentRequestId: string,
  ): Promise<PaymentRequestResDto> {
    const found = await this.db.query.paymentRequests.findFirst({
      where: eq(paymentRequests.id, paymentRequestId),
      with: {
        purchaseOrder: {
          with: {
            supplier: true,
            items: {
              with: {
                purchaseRequestItem: {
                  with: { item: { with: { unit: true } } },
                },
              },
            },
          },
        },
        paidByUser: true,
        cancelledByUser: true,
        creatorBy: true,
      },
    });

    if (!found) {
      throw new AppException(ErrorCode.E157, HttpStatus.NOT_FOUND);
    }

    const row = found;

    const receivedByItemId = await getReceivedQuantityByPurchaseOrderItemId(
      this.db,
      {
        purchaseOrderItemIds: row.purchaseOrder.items.map((item) => item.id),
        statuses: [InventoryDocumentStatus.POSTED],
      },
    );

    const items = row.purchaseOrder.items.map((item) => {
      const unitPrice = item.unitPrice ?? 0;

      return {
        id: item.id,
        materialCode: item.purchaseRequestItem.item.code,
        materialName: item.purchaseRequestItem.item.name,
        unit: item.purchaseRequestItem.item.unit.name,
        orderedQty: item.quantity,
        receivedQty: receivedByItemId.get(item.id) ?? 0,
        unitPrice,
        lineTotal: item.quantity * unitPrice,
      };
    });

    return plainToInstance(
      PaymentRequestResDto,
      {
        ...row,
        supplier: row.purchaseOrder.supplier,
        poValue: row.requestValue,
        items,
        createdBy: row.creatorBy,
        paidBy: row.paidByUser,
        cancelledBy: row.cancelledByUser,
      },
      { excludeExtraneousValues: true },
    );
  }

  async markPaymentRequestPaid(
    paymentRequestId: string,
    userId: string,
  ): Promise<void> {
    await this.ensurePaymentRequestPending(paymentRequestId);

    await this.db
      .update(paymentRequests)
      .set({
        status: PaymentRequestStatus.PAID,
        paidBy: userId,
        paidAt: new Date(),
      })
      .where(eq(paymentRequests.id, paymentRequestId));
  }

  async cancelPaymentRequest(
    paymentRequestId: string,
    userId: string,
  ): Promise<void> {
    await this.ensurePaymentRequestPending(paymentRequestId);

    await this.db
      .update(paymentRequests)
      .set({
        status: PaymentRequestStatus.CANCELLED,
        cancelledBy: userId,
        cancelledAt: new Date(),
      })
      .where(eq(paymentRequests.id, paymentRequestId));
  }

  /** Tự sinh một yêu cầu thanh toán khi PO `purchaseOrderId` đạt tiến độ COMPLETED (nhận đủ hàng)
   * — gọi từ `InventoryReceiptsService.postInventoryReceipt`, cùng transaction, cùng khuôn
   * `IqcService.createInspectionsFromReceipt`. Vô hại khi gọi lại nhiều lần (idempotent, không
   * throw) — PO có thể nhận qua nhiều phiếu, mỗi phiếu `post` xong đều gọi lại hàm này.
   * `paymentTerm` null nghĩa là PO được `confirm` từ trước khi có gate `E156` — bỏ qua, không tạo
   * bù (giới hạn đã biết, `docs/domains/purchasing.md`). */
  async createIfOrderCompleted(
    tx: DbTransaction,
    purchaseOrderId: string,
  ): Promise<void> {
    // Tái dùng đúng 2 subquery `resolveOrderProgress`/`getPurchaseOrders` (PurchaseOrdersService)
    // dùng để định nghĩa PO COMPLETED — tránh 2 nơi tính `orderedQuantity`/`receivedQuantity` theo
    // 2 công thức có thể lệch nhau về sau.
    const orderedAgg = orderAggregateSubquery(tx);
    const receivedAgg = orderReceivedQuantitySubquery(tx);

    const [existing, orderRows] = await Promise.all([
      tx.query.paymentRequests.findFirst({
        columns: { id: true },
        where: eq(paymentRequests.purchaseOrderId, purchaseOrderId),
      }),
      tx
        .select({
          orderDate: purchaseOrders.orderDate,
          paymentTerm: purchaseOrders.paymentTerm,
          orderedQuantity:
            sql<number>`coalesce(${orderedAgg.orderedQuantity}, 0)`.mapWith(
              Number,
            ),
          totalAmount:
            sql<number>`coalesce(${orderedAgg.totalAmount}, 0)`.mapWith(Number),
          receivedQuantity:
            sql<number>`coalesce(${receivedAgg.receivedQuantity}, 0)`.mapWith(
              Number,
            ),
        })
        .from(purchaseOrders)
        .leftJoin(orderedAgg, eq(orderedAgg.purchaseOrderId, purchaseOrders.id))
        .leftJoin(
          receivedAgg,
          eq(receivedAgg.purchaseOrderId, purchaseOrders.id),
        )
        .where(eq(purchaseOrders.id, purchaseOrderId)),
    ]);
    if (existing) {
      return;
    }

    const order = orderRows[0];
    if (!order?.paymentTerm) {
      return;
    }
    // PO 0 dòng: received(0) < ordered(0) là false nên lọt qua guard cuối — phải chặn tay riêng.
    if (order.orderedQuantity <= 0) {
      return;
    }
    if (order.receivedQuantity < order.orderedQuantity) {
      return;
    }

    const dueDate = new Date(
      order.orderDate.getTime() +
        PAYMENT_TERM_DAYS[order.paymentTerm] * 24 * 60 * 60 * 1000,
    );

    const code = await this.generatePaymentRequestCode(tx);
    await tx.insert(paymentRequests).values({
      code,
      purchaseOrderId,
      requestValue: order.totalAmount,
      dueDate,
    });
  }

  private async ensurePaymentRequestPending(
    paymentRequestId: string,
  ): Promise<void> {
    const row = await this.db.query.paymentRequests.findFirst({
      columns: { id: true, status: true },
      where: eq(paymentRequests.id, paymentRequestId),
    });

    if (!row) {
      throw new AppException(ErrorCode.E157, HttpStatus.NOT_FOUND);
    }
    if (row.status !== PaymentRequestStatus.PENDING) {
      throw new AppException(ErrorCode.E158, HttpStatus.CONFLICT);
    }
  }

  private async generatePaymentRequestCode(tx: DbTransaction): Promise<string> {
    const [totalRows] = await tx
      .select({ total: count() })
      .from(paymentRequests);
    return `YCTT-${String((totalRows?.total ?? 0) + 1).padStart(5, '0')}`;
  }
}
