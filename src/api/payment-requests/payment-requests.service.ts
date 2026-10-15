import { HttpStatus, Inject, Injectable, StreamableFile } from '@nestjs/common';
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
import { DateTime } from 'luxon';

import { OffsetPaginationDto } from '../../common/dto/offset-pagination/offset-pagination.dto';
import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import {
  DocumentType,
  generateDocumentSequence,
} from '../../common/utils/document-sequence.util';
import { buildXlsxBuffer, XLSX_MIME } from '../../common/utils/excel.util';
import { extractPostgresError } from '../../common/utils/postgres-error.util';
import { unaccentILike } from '../../common/utils/search.util';
import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import type { Database, DbTransaction } from '../../database/database.type';
import {
  InventoryDocumentStatus,
  PaymentRequestLogAction,
  paymentRequestLogs,
  PaymentRequestStatus,
  PaymentTerm,
  paymentRequests,
  purchaseOrderItems,
  PurchaseOrderStatus,
  purchaseOrders,
  suppliers,
  users,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import {
  calculatePurchaseOrderAmounts,
  getBilledQuotationQuantityByPurchaseOrderItemId,
  getReceivedQuantityByPurchaseOrderItemId,
  orderAggregateSubquery,
  orderReceivedQuantitySubquery,
} from '../purchase-orders/purchase-orders.query';
import { CancelPaymentRequestReqDto } from './dto/cancel-payment-request.req.dto';
import { UpdatePaymentRequestInvoiceReqDto } from './dto/update-payment-request-invoice.req.dto';
import { UpdatePaymentRequestExtraCostReqDto } from './dto/update-payment-request-extra-cost.req.dto';
import { ExportPaymentRequestsReqDto } from './dto/export-payment-requests.req.dto';
import { GetPaymentRequestLogsReqDto } from './dto/get-payment-request-logs.req.dto';
import { GetPaymentRequestsReqDto } from './dto/get-payment-requests.req.dto';
import { PagePaymentRequestResDto } from './dto/page-payment-request.res.dto';
import { PaymentRequestLogResDto } from './dto/payment-request-log.res.dto';
import { PaymentRequestResDto } from './dto/payment-request.res.dto';
import { PAYMENT_REQUEST_EXPORT_COLUMNS } from './payment-requests.export';

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
  private static readonly MAX_EXPORT_ROWS = 10_000;

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
            unaccentILike(paymentRequests.supplierInvoiceNo, keyword),
          )
        : undefined,
      poCodeKeyword
        ? unaccentILike(purchaseOrders.code, poCodeKeyword)
        : undefined,
      reqDto.supplierId
        ? eq(purchaseOrders.supplierId, reqDto.supplierId)
        : undefined,
      reqDto.status ? eq(paymentRequests.status, reqDto.status) : undefined,
      reqDto.startDate
        ? gte(paymentRequests.createdAt, reqDto.startDate)
        : undefined,
      // Biên trên loại trừ — `endDate` parse ra nửa đêm UTC, `lte` sẽ bỏ sót cùng ngày.
      reqDto.endDate
        ? lt(
            paymentRequests.createdAt,
            new Date(reqDto.endDate.getTime() + 24 * 60 * 60 * 1000),
          )
        : undefined,
    );

    // `.select()` thay vì relational query — `purchaseOrders`/`paymentRequests` collapse type ngay
    // ở `with:` 1 cấp (Drizzle relational query type-inference, không phải do lồng sâu). Join
    // thẳng, DTO (`PickType` trên Ref DTO) tự lọc field nào thật sự lộ ra ngoài.
    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select({
          id: paymentRequests.id,
          code: paymentRequests.code,
          purchaseOrder: getTableColumns(purchaseOrders),
          supplier: getTableColumns(suppliers),
          purchaseOrderTotalAmount:
            sql<number>`${paymentRequests.requestedAmount} + ${paymentRequests.advancePaymentAmount} - ${paymentRequests.extraCost}`.mapWith(
              Number,
            ),
          advancePaymentAmount: paymentRequests.advancePaymentAmount,
          requestedAmount: paymentRequests.requestedAmount,
          extraCost: paymentRequests.extraCost,
          extraCostNote: paymentRequests.extraCostNote,
          supplierInvoiceNo: paymentRequests.supplierInvoiceNo,
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
      new OffsetPaginationDto(total, reqDto),
    );
  }

  /** Cắt im lặng ở `MAX_EXPORT_ROWS`, không báo lỗi khi vượt trần. Bộ lọc tách riêng khỏi
   * `getPaymentRequests` dù trông giống nhau — hai route độc lập, sửa filter route nào chỉ route
   * đó đổi. */
  async exportPaymentRequests(
    reqDto: ExportPaymentRequestsReqDto,
  ): Promise<StreamableFile> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;
    const poCodeKeyword = reqDto.poCode ? `%${reqDto.poCode}%` : undefined;

    const where = and(
      keyword
        ? or(
            unaccentILike(paymentRequests.code, keyword),
            unaccentILike(purchaseOrders.code, keyword),
            unaccentILike(paymentRequests.supplierInvoiceNo, keyword),
          )
        : undefined,
      poCodeKeyword
        ? unaccentILike(purchaseOrders.code, poCodeKeyword)
        : undefined,
      reqDto.supplierId
        ? eq(purchaseOrders.supplierId, reqDto.supplierId)
        : undefined,
      reqDto.status ? eq(paymentRequests.status, reqDto.status) : undefined,
      reqDto.startDate
        ? gte(paymentRequests.createdAt, reqDto.startDate)
        : undefined,
      reqDto.endDate
        ? lt(
            paymentRequests.createdAt,
            new Date(reqDto.endDate.getTime() + 24 * 60 * 60 * 1000),
          )
        : undefined,
    );

    const exportedPaymentRequests = await this.db
      .select({
        code: paymentRequests.code,
        poCode: purchaseOrders.code,
        supplier: getTableColumns(suppliers),
        requestedAmount: paymentRequests.requestedAmount,
        extraCost: paymentRequests.extraCost,
        extraCostNote: paymentRequests.extraCostNote,
        dueDate: paymentRequests.dueDate,
        status: paymentRequests.status,
        paidAt: paymentRequests.paidAt,
        cancellationReason: paymentRequests.cancellationReason,
        supplierInvoiceNo: paymentRequests.supplierInvoiceNo,
        purchaseOrderNote: purchaseOrders.note,
        creatorName: users.fullName,
        createdAt: paymentRequests.createdAt,
      })
      .from(paymentRequests)
      .innerJoin(
        purchaseOrders,
        eq(purchaseOrders.id, paymentRequests.purchaseOrderId),
      )
      .innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
      .leftJoin(users, eq(users.id, paymentRequests.createdBy))
      .where(where)
      .orderBy(desc(paymentRequests.createdAt))
      .limit(PaymentRequestsService.MAX_EXPORT_ROWS);

    const buffer = await buildXlsxBuffer(
      'Yêu cầu thanh toán',
      PAYMENT_REQUEST_EXPORT_COLUMNS,
      exportedPaymentRequests,
    );
    const fileName = `yeu-cau-thanh-toan-${DateTime.now().toFormat('yyyyLLdd-HHmm')}.xlsx`;

    return new StreamableFile(buffer, {
      type: XLSX_MIME,
      disposition: `attachment; filename="${fileName}"`,
    });
  }

  /** Giữ relational query (không chuyển `.select()` như `getPaymentRequests` ở trên) —
   * `purchaseOrder.items` là quan hệ 1-nhiều và cần tự alias bảng `users` 3 lần
   * (`paidByUser`/`cancelledByUser`/`creatorBy`) nếu viết tay bằng `.select()`. */
  async getPaymentRequest(
    paymentRequestId: string,
  ): Promise<PaymentRequestResDto> {
    const paymentRequest = await this.db.query.paymentRequests.findFirst({
      where: eq(paymentRequests.id, paymentRequestId),
      with: {
        purchaseOrder: {
          with: {
            supplier: true,
            assignedUser: true,
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

    if (!paymentRequest) {
      throw new AppException(ErrorCode.E157, HttpStatus.NOT_FOUND);
    }

    const purchaseOrder = paymentRequest.purchaseOrder;

    const settledAmounts = await this.calculateSettledAmounts(
      this.db,
      purchaseOrder,
    );
    const receivedByItemId = settledAmounts.receivedQuantityByItemId;

    const items = purchaseOrder.items.map((item) => {
      const unitPrice = item.unitPrice ?? 0;
      const receivedQuotationQty = item.quotationUnit
        ? (settledAmounts.billedQuotationQuantityByItemId.get(item.id) ?? 0)
        : null;
      const receivedQty = receivedByItemId.get(item.id) ?? 0;

      return {
        id: item.id,
        directCode: item.purchaseRequestItem.item.code,
        directName: item.purchaseRequestItem.item.name,
        unit: item.purchaseRequestItem.item.unit.name,
        orderedQty: item.quantity,
        receivedQty,
        quotationUnit: item.quotationUnit ?? null,
        orderedQuotationQty: item.quotationQuantity,
        receivedQuotationQty,
        unitPrice,
        lineTotal: (receivedQuotationQty ?? receivedQty) * unitPrice,
      };
    });

    return plainToInstance(
      PaymentRequestResDto,
      {
        ...paymentRequest,
        supplier: purchaseOrder.supplier,
        purchaseOrderTotalAmount:
          paymentRequest.requestedAmount +
          paymentRequest.advancePaymentAmount -
          paymentRequest.extraCost,
        subtotal: settledAmounts.subtotal,
        vatAmount: settledAmounts.vatAmount,
        advancePaymentAmount: paymentRequest.advancePaymentAmount,
        advancePaymentNote: purchaseOrder.advancePaymentNote,
        extraCost: paymentRequest.extraCost,
        extraCostNote: paymentRequest.extraCostNote,
        purchaseOrderNote: purchaseOrder.note,
        vatPercent: purchaseOrder.vatPercent,
        otherCost: purchaseOrder.otherCost,
        otherCostNote: purchaseOrder.otherCostNote,
        items,
        createdBy: paymentRequest.creatorBy,
        paidBy: paymentRequest.paidByUser,
        cancelledBy: paymentRequest.cancelledByUser,
      },
      { excludeExtraneousValues: true },
    );
  }

  async markPaymentRequestPaid(
    paymentRequestId: string,
    userId: string,
  ): Promise<void> {
    await this.ensurePaymentRequestPending(paymentRequestId);

    await this.db.transaction(async (tx) => {
      await tx
        .update(paymentRequests)
        .set({
          status: PaymentRequestStatus.PAID,
          paidBy: userId,
          paidAt: new Date(),
        })
        .where(eq(paymentRequests.id, paymentRequestId));

      await tx.insert(paymentRequestLogs).values({
        paymentRequestId,
        action: PaymentRequestLogAction.PAID,
        content: 'Đánh dấu đã thanh toán',
        performedBy: userId,
      });
    });
  }

  async cancelPaymentRequest(
    paymentRequestId: string,
    reqDto: CancelPaymentRequestReqDto,
    userId: string,
  ): Promise<void> {
    await this.ensurePaymentRequestPending(paymentRequestId);

    await this.db.transaction((tx) =>
      this.markCancelled(tx, paymentRequestId, userId, reqDto.reason),
    );
  }

  /** Chi phí phát sinh sau khi đặt hàng (giao ngoài giờ, bốc dỡ...); chỉ sửa khi PENDING. */
  async updatePaymentRequestExtraCost(
    paymentRequestId: string,
    reqDto: UpdatePaymentRequestExtraCostReqDto,
    userId: string,
  ): Promise<void> {
    const nextExtraCost = reqDto.extraCost ?? 0;
    const nextExtraCostNote = reqDto.extraCostNote?.trim() || null;

    await this.db.transaction(async (tx) => {
      const paymentRequest = await tx.query.paymentRequests.findFirst({
        columns: { status: true, advancePaymentAmount: true },
        where: eq(paymentRequests.id, paymentRequestId),
        with: { purchaseOrder: { with: { items: true } } },
      });

      if (!paymentRequest) {
        throw new AppException(ErrorCode.E157, HttpStatus.NOT_FOUND);
      }
      if (paymentRequest.status !== PaymentRequestStatus.PENDING) {
        throw new AppException(ErrorCode.E158, HttpStatus.CONFLICT);
      }

      const settledAmounts = await this.calculateSettledAmounts(tx, {
        ...paymentRequest.purchaseOrder,
        advancePaymentAmount: paymentRequest.advancePaymentAmount,
      });
      const requestedAmount = settledAmounts.balanceDue + nextExtraCost;

      await tx
        .update(paymentRequests)
        .set({
          extraCost: nextExtraCost,
          extraCostNote: nextExtraCostNote,
          requestedAmount,
        })
        .where(eq(paymentRequests.id, paymentRequestId));

      await tx.insert(paymentRequestLogs).values({
        paymentRequestId,
        action: PaymentRequestLogAction.EXTRA_COST_UPDATED,
        content: `Cập nhật chi phí phát sinh: ${nextExtraCost.toLocaleString('vi-VN')} đ${nextExtraCostNote ? ` (${nextExtraCostNote})` : ''}`,
        performedBy: userId,
      });
    });
  }

  /** Số hóa đơn NCC do người dùng tự nhập; sửa được ở mọi trạng thái trừ `CANCELLED` (hóa đơn
   * thường về sau khi đã chi). Chuỗi rỗng coi như xoá. */
  async updatePaymentRequestInvoice(
    paymentRequestId: string,
    reqDto: UpdatePaymentRequestInvoiceReqDto,
  ): Promise<void> {
    const [paymentRequest] = await this.db
      .select({ status: paymentRequests.status })
      .from(paymentRequests)
      .where(eq(paymentRequests.id, paymentRequestId))
      .limit(1);

    if (!paymentRequest) {
      throw new AppException(ErrorCode.E157, HttpStatus.NOT_FOUND);
    }
    if (paymentRequest.status === PaymentRequestStatus.CANCELLED) {
      throw new AppException(ErrorCode.E158, HttpStatus.CONFLICT);
    }

    await this.db
      .update(paymentRequests)
      .set({ supplierInvoiceNo: reqDto.supplierInvoiceNo?.trim() || null })
      .where(eq(paymentRequests.id, paymentRequestId));
  }

  async getPaymentRequestLogs(
    paymentRequestId: string,
    reqDto: GetPaymentRequestLogsReqDto,
  ): Promise<OffsetPaginatedDto<PaymentRequestLogResDto>> {
    await this.ensurePaymentRequestExists(paymentRequestId);

    const where = eq(paymentRequestLogs.paymentRequestId, paymentRequestId);
    const [rows, [{ total }]] = await Promise.all([
      this.db.query.paymentRequestLogs.findMany({
        where,
        with: { performerBy: true },
        orderBy: desc(paymentRequestLogs.createdAt),
        limit: reqDto.limit,
        offset: reqDto.offset,
      }),
      this.db.select({ total: count() }).from(paymentRequestLogs).where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(PaymentRequestLogResDto, rows, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(total, reqDto),
    );
  }

  /** Tự sinh yêu cầu thanh toán khi PO đạt tiến độ COMPLETED (nhận đủ hàng) — gọi từ
   * `InventoryReceiptsService.postInventoryReceipt`, cùng transaction. Vô hại khi gọi lại nhiều
   * lần (kiểm `existing` + bắt `23505` — PO có thể nhận qua nhiều phiếu, kể cả 2 phiếu `post` gần
   * như đồng thời). Bỏ qua nếu PO đã `CANCELLED`, chưa có `paymentTerm` (gate `E156` cũ), hoặc 0
   * dòng — chi tiết từng trường hợp: `docs/domains/purchasing.md`, mục "Yêu cầu thanh toán". */
  async createIfOrderCompleted(
    tx: DbTransaction,
    purchaseOrderId: string,
  ): Promise<void> {
    // Tái dùng đúng 2 subquery `resolveOrderProgress`/`getPurchaseOrders` (PurchaseOrdersService)
    // dùng để định nghĩa PO COMPLETED — tránh 2 nơi tính `orderedQuantity`/`receivedQuantity` theo
    // 2 công thức có thể lệch nhau về sau.
    const orderedAgg = orderAggregateSubquery(tx);
    const receivedAgg = orderReceivedQuantitySubquery(tx);

    const [existing, purchaseOrderRows] = await Promise.all([
      tx.query.paymentRequests.findFirst({
        columns: { id: true, status: true },
        where: eq(paymentRequests.purchaseOrderId, purchaseOrderId),
      }),
      tx
        .select({
          code: purchaseOrders.code,
          status: purchaseOrders.status,
          orderDate: purchaseOrders.orderDate,
          paymentTerm: purchaseOrders.paymentTerm,
          advancePaymentAmount: purchaseOrders.advancePaymentAmount,
          orderedQuantity:
            sql<number>`coalesce(${orderedAgg.orderedQuantity}, 0)`.mapWith(
              Number,
            ),
          vatPercent: purchaseOrders.vatPercent,
          otherCost: purchaseOrders.otherCost,
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
    // YCTT đã huỷ (phiếu nhập bị huỷ rồi nhận lại đủ hàng) thì hồi sinh bên dưới; `PENDING`/`PAID` giữ nguyên.
    if (existing && existing.status !== PaymentRequestStatus.CANCELLED) {
      return;
    }

    const purchaseOrder = purchaseOrderRows[0];
    // PO còn treo phiếu nhập DRAFT lúc bị huỷ (`cancelPurchaseOrder` chỉ chặn khi đã có phiếu
    // `POSTED`, `E124`) vẫn có thể `post` sau đó — không sinh YCTT cho PO không còn `ORDERED`.
    if (purchaseOrder?.status !== PurchaseOrderStatus.ORDERED) {
      return;
    }
    if (!purchaseOrder.paymentTerm) {
      return;
    }
    // PO 0 dòng: received(0) < ordered(0) là false nên lọt qua guard cuối — phải chặn tay riêng.
    if (purchaseOrder.orderedQuantity <= 0) {
      return;
    }
    if (purchaseOrder.receivedQuantity < purchaseOrder.orderedQuantity) {
      return;
    }

    // Số đề nghị chi = tổng tiền theo số thực nhập − tiền đã tạm ứng cho NCC (PH-128, PH-135).
    const orderItems = await tx
      .select({
        id: purchaseOrderItems.id,
        quantity: purchaseOrderItems.quantity,
        unitPrice: purchaseOrderItems.unitPrice,
        quotationUnit: purchaseOrderItems.quotationUnit,
      })
      .from(purchaseOrderItems)
      .where(eq(purchaseOrderItems.purchaseOrderId, purchaseOrderId));
    const { balanceDue } = await this.calculateSettledAmounts(tx, {
      ...purchaseOrder,
      items: orderItems,
    });

    const dueDate = new Date(
      purchaseOrder.orderDate.getTime() +
        PAYMENT_TERM_DAYS[purchaseOrder.paymentTerm] * 24 * 60 * 60 * 1000,
    );

    // `purchase_order_id` unique → không chèn dòng mới, đưa bản ghi đã huỷ về `PENDING` với số liệu hiện tại.
    if (existing) {
      await tx
        .update(paymentRequests)
        .set({
          status: PaymentRequestStatus.PENDING,
          requestedAmount: balanceDue,
          advancePaymentAmount: purchaseOrder.advancePaymentAmount,
          extraCost: 0,
          extraCostNote: null,
          dueDate,
          cancelledBy: null,
          cancelledAt: null,
          cancellationReason: null,
        })
        .where(eq(paymentRequests.id, existing.id));

      await tx.insert(paymentRequestLogs).values({
        paymentRequestId: existing.id,
        action: PaymentRequestLogAction.CREATED,
        content: `Tự động sinh lại yêu cầu thanh toán khi PO ${purchaseOrder.code} nhận đủ hàng`,
        performedBy: null,
      });
      return;
    }

    const code = await this.generatePaymentRequestCode(tx);
    try {
      const [created] = await tx
        .insert(paymentRequests)
        .values({
          code,
          purchaseOrderId,
          requestedAmount: balanceDue,
          advancePaymentAmount: purchaseOrder.advancePaymentAmount,
          dueDate,
        })
        .returning({ id: paymentRequests.id });

      if (created) {
        await tx.insert(paymentRequestLogs).values({
          paymentRequestId: created.id,
          action: PaymentRequestLogAction.CREATED,
          content: `Tự động sinh yêu cầu thanh toán khi PO ${purchaseOrder.code} nhận đủ hàng`,
          performedBy: null,
        });
      }
    } catch (error) {
      // 2 phiếu nhập của cùng PO `post` gần như đồng thời có thể cùng lọt qua check `existing` ở
      // trên trước khi bên kia commit — `purchase_order_id` unique chặn dòng thứ hai bằng 23505,
      // coi như đã tồn tại (không throw) thay vì làm rollback cả transaction `postInventoryReceipt`.
      if (extractPostgresError(error)?.code !== '23505') {
        throw error;
      }
    }
  }

  /** Số tiền chốt của YCTT theo số thực nhập (PH-135): dòng PO có ĐVBG tính đơn giá × SL ĐVBG thực
   * nhập (đã trừ hàng trả NCC theo tỉ lệ), dòng còn lại đơn giá × SL thực nhập (đã trừ hàng trả NCC);
   * rồi cộng VAT, chi phí khác, trừ tạm ứng. Trả thêm SL ĐVBG thực nhập theo từng dòng để hiển thị đối chiếu. */
  private async calculateSettledAmounts(
    executor: Database | DbTransaction,
    purchaseOrder: {
      vatPercent: number;
      otherCost: number;
      advancePaymentAmount: number;
      items: {
        id: string;
        quantity: number;
        unitPrice: number | null;
        quotationUnit: string | null;
      }[];
    },
  ) {
    const [billedQuotationQuantityByItemId, receivedQuantityByItemId] =
      await Promise.all([
        getBilledQuotationQuantityByPurchaseOrderItemId(
          executor,
          purchaseOrder.items.map((item) => item.id),
        ),
        getReceivedQuantityByPurchaseOrderItemId(executor, {
          purchaseOrderItemIds: purchaseOrder.items.map((item) => item.id),
          statuses: [InventoryDocumentStatus.POSTED],
        }),
      ]);

    const amounts = calculatePurchaseOrderAmounts({
      ...purchaseOrder,
      items: purchaseOrder.items.map((item) => ({
        quantity: item.quotationUnit
          ? (billedQuotationQuantityByItemId.get(item.id) ?? 0)
          : (receivedQuantityByItemId.get(item.id) ?? 0),
        unitPrice: item.unitPrice,
      })),
    });

    return {
      ...amounts,
      billedQuotationQuantityByItemId,
      receivedQuantityByItemId,
    };
  }

  /** Tổng tiền hàng đã chốt (đề nghị chi + tạm ứng − chi phí phát sinh) của YCTT chưa huỷ của PO;
   * null khi chưa có YCTT. Không gồm chi phí phát sinh (PH-131) để tạm ứng không được vượt tiền hàng. */
  async getSettledTotalAmount(
    tx: DbTransaction,
    purchaseOrderId: string,
  ): Promise<number | null> {
    const [paymentRequest] = await tx
      .select({
        requestedAmount: paymentRequests.requestedAmount,
        advancePaymentAmount: paymentRequests.advancePaymentAmount,
        extraCost: paymentRequests.extraCost,
        status: paymentRequests.status,
      })
      .from(paymentRequests)
      .where(eq(paymentRequests.purchaseOrderId, purchaseOrderId))
      .limit(1);

    if (
      !paymentRequest ||
      paymentRequest.status === PaymentRequestStatus.CANCELLED
    ) {
      return null;
    }
    return (
      paymentRequest.requestedAmount +
      paymentRequest.advancePaymentAmount -
      paymentRequest.extraCost
    );
  }

  /** Đồng bộ tiền tạm ứng của PO sang YCTT (PH-128) — chạy trong transaction của
   * `PurchaseOrdersService.updatePurchaseOrderAdvancePayment`. Không có YCTT hoặc đã huỷ thì bỏ qua
   * (YCTT huỷ sẽ sinh lại theo số PO lúc đó); `PAID` thì chặn (`E284`) vì tiền đã chi. */
  async applyAdvancePayment(
    tx: DbTransaction,
    input: {
      purchaseOrderId: string;
      advancePaymentAmount: number;
      balanceDue: number;
      userId: string;
    },
  ): Promise<void> {
    const existing = await tx.query.paymentRequests.findFirst({
      columns: { id: true, status: true, extraCost: true },
      where: eq(paymentRequests.purchaseOrderId, input.purchaseOrderId),
    });

    if (!existing || existing.status === PaymentRequestStatus.CANCELLED) {
      return;
    }
    if (existing.status === PaymentRequestStatus.PAID) {
      throw new AppException(ErrorCode.E284, HttpStatus.CONFLICT);
    }

    // Chi phí phát sinh (PH-131) cộng vào số đề nghị chi, không bị tạm ứng bù trừ.
    const requestedAmount = input.balanceDue + existing.extraCost;

    await tx
      .update(paymentRequests)
      .set({
        advancePaymentAmount: input.advancePaymentAmount,
        requestedAmount,
      })
      .where(eq(paymentRequests.id, existing.id));

    await tx.insert(paymentRequestLogs).values({
      paymentRequestId: existing.id,
      action: PaymentRequestLogAction.ADVANCE_PAYMENT_UPDATED,
      content: `Cập nhật tiền tạm ứng ${input.advancePaymentAmount.toLocaleString('vi-VN')} đ, còn lại phải thanh toán ${requestedAmount.toLocaleString('vi-VN')} đ${existing.extraCost > 0 ? ` (đã gồm chi phí phát sinh ${existing.extraCost.toLocaleString('vi-VN')} đ)` : ''}`,
      performedBy: input.userId,
    });
  }

  /** Huỷ YCTT của PO khi nguồn của nó bị huỷ (phiếu nhập đã ghi sổ, hoặc chính PO) — chạy trong
   * transaction của bên gọi. Không có YCTT hoặc đã huỷ thì bỏ qua; `PAID` thì chặn (`E284`) vì tiền
   * đã chi. Nguồn gọi truyền `reason` để log nêu rõ vì sao. */
  async cancelForOrder(
    tx: DbTransaction,
    purchaseOrderId: string,
    userId: string,
    reason: string,
  ): Promise<void> {
    const existing = await tx.query.paymentRequests.findFirst({
      columns: { id: true, status: true },
      where: eq(paymentRequests.purchaseOrderId, purchaseOrderId),
    });

    if (!existing || existing.status === PaymentRequestStatus.CANCELLED) {
      return;
    }
    if (existing.status === PaymentRequestStatus.PAID) {
      throw new AppException(ErrorCode.E284, HttpStatus.CONFLICT);
    }

    await this.markCancelled(tx, existing.id, userId, reason);
  }

  /** Đổi YCTT sang `CANCELLED` và ghi log — dùng chung cho huỷ tay và huỷ theo PO/phiếu nhập. */
  private async markCancelled(
    tx: DbTransaction,
    paymentRequestId: string,
    userId: string,
    reason: string,
  ): Promise<void> {
    await tx
      .update(paymentRequests)
      .set({
        status: PaymentRequestStatus.CANCELLED,
        cancelledBy: userId,
        cancelledAt: new Date(),
        cancellationReason: reason,
      })
      .where(eq(paymentRequests.id, paymentRequestId));

    await tx.insert(paymentRequestLogs).values({
      paymentRequestId,
      action: PaymentRequestLogAction.CANCELLED,
      content: `Hủy yêu cầu — lý do: ${reason}`,
      performedBy: userId,
    });
  }

  private async ensurePaymentRequestExists(
    paymentRequestId: string,
  ): Promise<void> {
    const row = await this.db.query.paymentRequests.findFirst({
      columns: { id: true },
      where: eq(paymentRequests.id, paymentRequestId),
    });

    if (!row) {
      throw new AppException(ErrorCode.E157, HttpStatus.NOT_FOUND);
    }
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
    const sequence = await generateDocumentSequence(
      tx,
      DocumentType.PAYMENT_REQUEST,
    );

    return `YCTT-${String(sequence).padStart(5, '0')}`;
  }
}
