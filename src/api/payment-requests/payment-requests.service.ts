import { HttpStatus, Inject, Injectable, StreamableFile } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import {
  and,
  count,
  desc,
  eq,
  getTableColumns,
  gte,
  inArray,
  lt,
  or,
  sql,
} from 'drizzle-orm';
import { DateTime } from 'luxon';

import { OffsetPaginationDto } from '../../common/dto/offset-pagination/offset-pagination.dto';
import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import { exclusiveEndOfDay } from '../../common/utils/date-range.util';
import {
  DocumentType,
  generateDocumentSequence,
} from '../../common/utils/document-sequence.util';
import { buildXlsxBuffer, XLSX_MIME } from '../../common/utils/excel.util';
import { extractPostgresError } from '../../common/utils/postgres-error.util';
import { unaccentILike } from '../../common/utils/search.util';
import { formatVnd } from '../../common/utils/vnd.util';
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
import { ExportPaymentRequestsReqDto } from './dto/export-payment-requests.req.dto';
import { GetPaymentRequestLogsReqDto } from './dto/get-payment-request-logs.req.dto';
import { GetPaymentRequestsReqDto } from './dto/get-payment-requests.req.dto';
import { PagePaymentRequestResDto } from './dto/page-payment-request.res.dto';
import { PaymentRequestLogResDto } from './dto/payment-request-log.res.dto';
import { PaymentRequestResDto } from './dto/payment-request.res.dto';
import { RejectPaymentRequestReqDto } from './dto/reject-payment-request.req.dto';
import { UpdatePaymentRequestExtraCostReqDto } from './dto/update-payment-request-extra-cost.req.dto';
import { UpdatePaymentRequestInvoiceReqDto } from './dto/update-payment-request-invoice.req.dto';
import { UpdatePaymentRequestNoteReqDto } from './dto/update-payment-request-note.req.dto';
import { UpdatePaymentRequestUrgencyReqDto } from './dto/update-payment-request-urgency.req.dto';
import { PAYMENT_REQUEST_EXPORT_COLUMNS } from './payment-requests.export';

/** Số ngày tính hạn thanh toán từ `orderDate` của PO — `createIfOrderCompleted` là consumer thật
 * đầu tiên của `purchase_orders.paymentTerm`. */
const PAYMENT_TERM_DAYS: Record<PaymentTerm, number> = {
  [PaymentTerm.IMMEDIATE]: 0,
  [PaymentTerm.NET_15]: 15,
  [PaymentTerm.NET_30]: 30,
  [PaymentTerm.NET_60]: 60,
};

/** Trạng thái người mua còn được sửa phát sinh và (re)gửi đề nghị thanh toán (PH-134). */
const EDITABLE_PAYMENT_REQUEST_STATUSES: readonly PaymentRequestStatus[] = [
  PaymentRequestStatus.DRAFT,
  PaymentRequestStatus.REJECTED,
];

/** Chưa chi và chưa huỷ — còn huỷ được và đổi được mức độ gấp. */
const OPEN_PAYMENT_REQUEST_STATUSES: readonly PaymentRequestStatus[] = [
  PaymentRequestStatus.DRAFT,
  PaymentRequestStatus.PENDING,
  PaymentRequestStatus.REJECTED,
];

/** Mọi trạng thái trừ `CANCELLED` — ghi chú và số hóa đơn vẫn sửa được sau khi đã chi. */
const NON_CANCELLED_PAYMENT_REQUEST_STATUSES: readonly PaymentRequestStatus[] =
  Object.values(PaymentRequestStatus).filter(
    (status) => status !== PaymentRequestStatus.CANCELLED,
  );

/** Số liệu chốt theo PO tại thời điểm sinh (hoặc sinh lại) YCTT. */
interface PaymentRequestSnapshot {
  requestedAmount: number;
  advancePaymentAmount: number;
  dueDate: Date;
}

/** `payment_request_logs.content` là varchar(1000); lý do tối đa 1000 ký tự cộng tiền tố sẽ vượt. */
const MAX_LOG_CONTENT_LENGTH = 1000;

function truncateLogContent(content: string): string {
  return content.slice(0, MAX_LOG_CONTENT_LENGTH);
}

/** Tổng tiền hàng đã chốt: đề nghị chi + tạm ứng − chi phí phát sinh (phát sinh không phải tiền hàng). */
function settledTotalOf(paymentRequest: {
  requestedAmount: number;
  advancePaymentAmount: number;
  extraCost: number;
}): number {
  return (
    paymentRequest.requestedAmount +
    paymentRequest.advancePaymentAmount -
    paymentRequest.extraCost
  );
}

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
      reqDto.isUrgent !== undefined
        ? eq(paymentRequests.isUrgent, reqDto.isUrgent)
        : undefined,
      reqDto.startDate
        ? gte(paymentRequests.createdAt, reqDto.startDate)
        : undefined,
      reqDto.endDate
        ? lt(paymentRequests.createdAt, exclusiveEndOfDay(reqDto.endDate))
        : undefined,
    );

    // `.select()` thay vì relational query: type của `purchaseOrders`/`paymentRequests` bị collapse
    // ngay ở `with:` một cấp. DTO (`PickType` trên Ref DTO) lọc field nào lộ ra ngoài.
    const [pagePaymentRequests, [{ total }]] = await Promise.all([
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
          isUrgent: paymentRequests.isUrgent,
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
      // Không join `suppliers`: `where` chỉ tham chiếu `purchaseOrders`.
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
      plainToInstance(PagePaymentRequestResDto, pagePaymentRequests, {
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
      reqDto.isUrgent !== undefined
        ? eq(paymentRequests.isUrgent, reqDto.isUrgent)
        : undefined,
      reqDto.startDate
        ? gte(paymentRequests.createdAt, reqDto.startDate)
        : undefined,
      reqDto.endDate
        ? lt(paymentRequests.createdAt, exclusiveEndOfDay(reqDto.endDate))
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
        isUrgent: paymentRequests.isUrgent,
        note: sql<
          string | null
        >`coalesce(${paymentRequests.note}, ${purchaseOrders.note})`,
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
        sentByUser: true,
        rejectedByUser: true,
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

    const items = purchaseOrder.items.map((item) => {
      const unitPrice = item.unitPrice ?? 0;
      const receivedQuotationQty = item.quotationUnit
        ? (settledAmounts.billedQuotationQuantityByItemId.get(item.id) ?? 0)
        : null;
      const receivedQty =
        settledAmounts.receivedQuantityByItemId.get(item.id) ?? 0;

      return {
        id: item.id,
        directCode: item.purchaseRequestItem.item.code,
        directName: item.purchaseRequestItem.item.name,
        unit: item.purchaseRequestItem.item.unit.name,
        orderedQty: item.quantity,
        receivedQty,
        quotationUnit: item.quotationUnit,
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
        purchaseOrderTotalAmount: settledTotalOf(paymentRequest),
        subtotal: settledAmounts.subtotal,
        vatAmount: settledAmounts.vatAmount,
        advancePaymentNote: purchaseOrder.advancePaymentNote,
        purchaseOrderNote: purchaseOrder.note,
        vatPercent: purchaseOrder.vatPercent,
        otherCost: purchaseOrder.otherCost,
        otherCostNote: purchaseOrder.otherCostNote,
        items,
        createdBy: paymentRequest.creatorBy,
        sentBy: paymentRequest.sentByUser,
        rejectedBy: paymentRequest.rejectedByUser,
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
    await this.ensurePaymentRequestStatus(paymentRequestId, [
      PaymentRequestStatus.PENDING,
    ]);

    await this.db.transaction(async (tx) => {
      await this.transitionStatus(
        tx,
        paymentRequestId,
        [PaymentRequestStatus.PENDING],
        {
          status: PaymentRequestStatus.PAID,
          paidBy: userId,
          paidAt: new Date(),
        },
      );

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
    await this.ensurePaymentRequestStatus(
      paymentRequestId,
      OPEN_PAYMENT_REQUEST_STATUSES,
    );

    await this.db.transaction((tx) =>
      this.markCancelled(tx, paymentRequestId, userId, reqDto.reason),
    );
  }

  /** Người mua đề nghị thanh toán (PH-134): `DRAFT`/`REJECTED` → `PENDING`, chuyển sang kế toán duyệt. */
  async sendPaymentRequest(
    paymentRequestId: string,
    userId: string,
  ): Promise<void> {
    await this.ensurePaymentRequestStatus(
      paymentRequestId,
      EDITABLE_PAYMENT_REQUEST_STATUSES,
    );

    await this.db.transaction(async (tx) => {
      await this.transitionStatus(
        tx,
        paymentRequestId,
        EDITABLE_PAYMENT_REQUEST_STATUSES,
        {
          status: PaymentRequestStatus.PENDING,
          sentBy: userId,
          sentAt: new Date(),
        },
      );

      await tx.insert(paymentRequestLogs).values({
        paymentRequestId,
        action: PaymentRequestLogAction.SENT,
        content: 'Đề nghị thanh toán',
        performedBy: userId,
      });
    });
  }

  /** Kế toán/giám đốc từ chối thanh toán (PH-134): `PENDING` → `REJECTED` kèm lý do, người mua sửa
   * rồi đề nghị lại. Khác `cancel` — huỷ là kết thúc hẳn. */
  async rejectPaymentRequest(
    paymentRequestId: string,
    reqDto: RejectPaymentRequestReqDto,
    userId: string,
  ): Promise<void> {
    await this.ensurePaymentRequestStatus(paymentRequestId, [
      PaymentRequestStatus.PENDING,
    ]);

    await this.db.transaction(async (tx) => {
      await this.transitionStatus(
        tx,
        paymentRequestId,
        [PaymentRequestStatus.PENDING],
        {
          status: PaymentRequestStatus.REJECTED,
          rejectedBy: userId,
          rejectedAt: new Date(),
          rejectionReason: reqDto.reason,
        },
      );

      await tx.insert(paymentRequestLogs).values({
        paymentRequestId,
        action: PaymentRequestLogAction.REJECTED,
        content: truncateLogContent(
          `Từ chối thanh toán — lý do: ${reqDto.reason}`,
        ),
        performedBy: userId,
      });
    });
  }

  /** Chi phí phát sinh sau khi đặt hàng (giao ngoài giờ, bốc dỡ...); chỉ sửa khi người mua còn
   * đang xử lý (`DRAFT`/`REJECTED`) để kế toán duyệt trên số cố định. */
  async updatePaymentRequestExtraCost(
    paymentRequestId: string,
    reqDto: UpdatePaymentRequestExtraCostReqDto,
    userId: string,
  ): Promise<void> {
    const nextExtraCost = reqDto.extraCost ?? 0;
    const nextExtraCostNote = reqDto.extraCostNote?.trim() || null;

    await this.db.transaction(async (tx) => {
      // Khóa dòng YCTT để số tiền tạm ứng đọc ở dưới không bị `applyAdvancePayment` đổi xen giữa
      // (hai bên cùng ghi `requestedAmount`).
      await tx
        .select({ id: paymentRequests.id })
        .from(paymentRequests)
        .where(eq(paymentRequests.id, paymentRequestId))
        .for('update');

      const paymentRequest = await tx.query.paymentRequests.findFirst({
        columns: { status: true, advancePaymentAmount: true },
        where: eq(paymentRequests.id, paymentRequestId),
        with: { purchaseOrder: { with: { items: true } } },
      });

      if (!paymentRequest) {
        throw new AppException(ErrorCode.E157, HttpStatus.NOT_FOUND);
      }
      if (!EDITABLE_PAYMENT_REQUEST_STATUSES.includes(paymentRequest.status)) {
        throw new AppException(ErrorCode.E158, HttpStatus.CONFLICT);
      }

      const settledAmounts = await this.calculateSettledAmounts(tx, {
        ...paymentRequest.purchaseOrder,
        advancePaymentAmount: paymentRequest.advancePaymentAmount,
      });
      const requestedAmount = settledAmounts.balanceDue + nextExtraCost;

      // Điều kiện trạng thái nằm ngay trong UPDATE để một lần `send` đồng thời không làm đổi số tiền
      // sau khi YCTT đã gửi kế toán.
      await this.transitionStatus(
        tx,
        paymentRequestId,
        EDITABLE_PAYMENT_REQUEST_STATUSES,
        {
          extraCost: nextExtraCost,
          extraCostNote: nextExtraCostNote,
          requestedAmount,
        },
      );

      await tx.insert(paymentRequestLogs).values({
        paymentRequestId,
        action: PaymentRequestLogAction.EXTRA_COST_UPDATED,
        content: truncateLogContent(
          `Cập nhật chi phí phát sinh: ${formatVnd(nextExtraCost)} đ${nextExtraCostNote ? ` (${nextExtraCostNote})` : ''}`,
        ),
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
    await this.ensurePaymentRequestStatus(
      paymentRequestId,
      NON_CANCELLED_PAYMENT_REQUEST_STATUSES,
    );

    await this.db
      .update(paymentRequests)
      .set({ supplierInvoiceNo: reqDto.supplierInvoiceNo?.trim() || null })
      .where(eq(paymentRequests.id, paymentRequestId));
  }

  /** Ghi chú của YCTT (PH-132) thay cho ô ghi chú PO: chưa có thì màn hình/bản in/Excel hiện ghi chú
   * của PO. Sửa được ở mọi trạng thái trừ `CANCELLED`; chuỗi rỗng coi như xoá. */
  async updatePaymentRequestNote(
    paymentRequestId: string,
    reqDto: UpdatePaymentRequestNoteReqDto,
  ): Promise<void> {
    await this.ensurePaymentRequestStatus(
      paymentRequestId,
      NON_CANCELLED_PAYMENT_REQUEST_STATUSES,
    );

    await this.db
      .update(paymentRequests)
      .set({ note: reqDto.note?.trim() || null })
      .where(eq(paymentRequests.id, paymentRequestId));
  }

  /** Đánh dấu YCTT gấp / bình thường (PH-133); đổi được khi chưa chi hoặc huỷ (`DRAFT`/`PENDING`/
   * `REJECTED`) vì sau đó mức độ ưu tiên không còn ý nghĩa. */
  async updatePaymentRequestUrgency(
    paymentRequestId: string,
    reqDto: UpdatePaymentRequestUrgencyReqDto,
  ): Promise<void> {
    await this.ensurePaymentRequestStatus(
      paymentRequestId,
      OPEN_PAYMENT_REQUEST_STATUSES,
    );

    await this.db
      .update(paymentRequests)
      .set({ isUrgent: reqDto.isUrgent })
      .where(eq(paymentRequests.id, paymentRequestId));
  }

  async getPaymentRequestLogs(
    paymentRequestId: string,
    reqDto: GetPaymentRequestLogsReqDto,
  ): Promise<OffsetPaginatedDto<PaymentRequestLogResDto>> {
    await this.ensurePaymentRequestExists(paymentRequestId);

    const where = eq(paymentRequestLogs.paymentRequestId, paymentRequestId);
    const [requestLogs, [{ total }]] = await Promise.all([
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
      plainToInstance(PaymentRequestLogResDto, requestLogs, {
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
    // Cùng 2 subquery với `PurchaseOrdersService` để "COMPLETED" chỉ có một công thức.
    const orderedAgg = orderAggregateSubquery(tx);
    const receivedAgg = orderReceivedQuantitySubquery(tx);

    const [existing, [purchaseOrder]] = await Promise.all([
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
    // YCTT đã huỷ (phiếu nhập bị huỷ rồi nhận lại đủ hàng) thì hồi sinh bên dưới; các trạng thái khác giữ nguyên.
    if (existing && existing.status !== PaymentRequestStatus.CANCELLED) {
      return;
    }

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

    const dueDate = DateTime.fromJSDate(purchaseOrder.orderDate, {
      zone: 'utc',
    })
      .plus({ days: PAYMENT_TERM_DAYS[purchaseOrder.paymentTerm] })
      .toJSDate();
    const snapshot: PaymentRequestSnapshot = {
      requestedAmount: balanceDue,
      advancePaymentAmount: purchaseOrder.advancePaymentAmount,
      dueDate,
    };

    if (existing) {
      await this.reviveCancelledPaymentRequest(
        tx,
        existing.id,
        purchaseOrder.code,
        snapshot,
      );
      return;
    }
    await this.insertPaymentRequest(
      tx,
      purchaseOrderId,
      purchaseOrder.code,
      snapshot,
    );
  }

  /** `purchase_order_id` unique → không chèn dòng mới, đưa bản ghi đã huỷ về `DRAFT` với số liệu hiện tại. */
  private async reviveCancelledPaymentRequest(
    tx: DbTransaction,
    paymentRequestId: string,
    purchaseOrderCode: string,
    snapshot: PaymentRequestSnapshot,
  ): Promise<void> {
    await tx
      .update(paymentRequests)
      .set({
        ...snapshot,
        status: PaymentRequestStatus.DRAFT,
        extraCost: 0,
        extraCostNote: null,
        sentBy: null,
        sentAt: null,
        rejectedBy: null,
        rejectedAt: null,
        rejectionReason: null,
        cancelledBy: null,
        cancelledAt: null,
        cancellationReason: null,
      })
      .where(eq(paymentRequests.id, paymentRequestId));

    await tx.insert(paymentRequestLogs).values({
      paymentRequestId,
      action: PaymentRequestLogAction.CREATED,
      content: `Tự động sinh lại yêu cầu thanh toán khi PO ${purchaseOrderCode} nhận đủ hàng`,
      performedBy: null,
    });
  }

  private async insertPaymentRequest(
    tx: DbTransaction,
    purchaseOrderId: string,
    purchaseOrderCode: string,
    snapshot: PaymentRequestSnapshot,
  ): Promise<void> {
    const code = await this.generatePaymentRequestCode(tx);
    try {
      const [created] = await tx
        .insert(paymentRequests)
        .values({ ...snapshot, code, purchaseOrderId })
        .returning({ id: paymentRequests.id });

      if (created) {
        await tx.insert(paymentRequestLogs).values({
          paymentRequestId: created.id,
          action: PaymentRequestLogAction.CREATED,
          content: `Tự động sinh yêu cầu thanh toán khi PO ${purchaseOrderCode} nhận đủ hàng`,
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
    const purchaseOrderItemIds = purchaseOrder.items.map((item) => item.id);
    const [billedQuotationQuantityByItemId, receivedQuantityByItemId] =
      await Promise.all([
        getBilledQuotationQuantityByPurchaseOrderItemId(
          executor,
          purchaseOrderItemIds,
        ),
        getReceivedQuantityByPurchaseOrderItemId(executor, {
          purchaseOrderItemIds,
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
    return settledTotalOf(paymentRequest);
  }

  /** Đồng bộ tiền tạm ứng của PO sang YCTT (PH-128) — chạy trong transaction của
   * `PurchaseOrdersService.updatePurchaseOrderAdvancePayment`. Không có YCTT hoặc đã huỷ thì bỏ qua
   * (YCTT huỷ sẽ sinh lại theo số PO lúc đó); `PAID` thì chặn (`E284`) vì tiền đã chi, `PENDING` thì chặn (`E317`) vì kế toán đang duyệt. */
  async applyAdvancePayment(
    tx: DbTransaction,
    input: {
      purchaseOrderId: string;
      advancePaymentAmount: number;
      balanceDue: number;
      userId: string;
    },
  ): Promise<void> {
    // Khóa dòng YCTT: `send`/`mark-paid` đồng thời phải chờ, nên trạng thái đọc ở đây còn đúng lúc ghi.
    const [existing] = await tx
      .select({
        id: paymentRequests.id,
        status: paymentRequests.status,
        extraCost: paymentRequests.extraCost,
      })
      .from(paymentRequests)
      .where(eq(paymentRequests.purchaseOrderId, input.purchaseOrderId))
      .limit(1)
      .for('update');

    if (!existing || existing.status === PaymentRequestStatus.CANCELLED) {
      return;
    }
    if (existing.status === PaymentRequestStatus.PAID) {
      throw new AppException(ErrorCode.E284, HttpStatus.CONFLICT);
    }
    // Kế toán đang duyệt số đề nghị chi đã gửi — chỉ sửa được khi YCTT còn ở người mua (nháp/bị từ chối).
    if (existing.status === PaymentRequestStatus.PENDING) {
      throw new AppException(ErrorCode.E317, HttpStatus.CONFLICT);
    }

    // Chi phí phát sinh (PH-131) cộng vào số đề nghị chi, không bị tạm ứng bù trừ.
    const requestedAmount = input.balanceDue + existing.extraCost;

    await this.transitionStatus(
      tx,
      existing.id,
      EDITABLE_PAYMENT_REQUEST_STATUSES,
      {
        advancePaymentAmount: input.advancePaymentAmount,
        requestedAmount,
      },
    );

    await tx.insert(paymentRequestLogs).values({
      paymentRequestId: existing.id,
      action: PaymentRequestLogAction.ADVANCE_PAYMENT_UPDATED,
      content: `Cập nhật tiền tạm ứng ${formatVnd(input.advancePaymentAmount)} đ, còn lại phải thanh toán ${formatVnd(requestedAmount)} đ${existing.extraCost > 0 ? ` (đã gồm chi phí phát sinh ${formatVnd(existing.extraCost)} đ)` : ''}`,
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
    await this.transitionStatus(
      tx,
      paymentRequestId,
      OPEN_PAYMENT_REQUEST_STATUSES,
      {
        status: PaymentRequestStatus.CANCELLED,
        cancelledBy: userId,
        cancelledAt: new Date(),
        cancellationReason: reason,
      },
    );

    await tx.insert(paymentRequestLogs).values({
      paymentRequestId,
      action: PaymentRequestLogAction.CANCELLED,
      content: truncateLogContent(`Hủy yêu cầu — lý do: ${reason}`),
      performedBy: userId,
    });
  }

  /** UPDATE chỉ khi YCTT còn đúng ở `fromStatuses` — kiểm tra và ghi trong cùng một câu lệnh nên hai
   * thao tác đồng thời (kế toán xác nhận vs từ chối, người mua gửi vs huỷ) không ghi đè nhau; bên
   * thua nhận E158. Gọi trong transaction để log chỉ được ghi khi chuyển trạng thái thành công. */
  private async transitionStatus(
    tx: DbTransaction,
    paymentRequestId: string,
    fromStatuses: readonly PaymentRequestStatus[],
    values: Partial<typeof paymentRequests.$inferInsert>,
  ): Promise<void> {
    const updatedPaymentRequests = await tx
      .update(paymentRequests)
      .set(values)
      .where(
        and(
          eq(paymentRequests.id, paymentRequestId),
          inArray(paymentRequests.status, [...fromStatuses]),
        ),
      )
      .returning({ id: paymentRequests.id });

    if (updatedPaymentRequests.length === 0) {
      throw new AppException(ErrorCode.E158, HttpStatus.CONFLICT);
    }
  }

  private async ensurePaymentRequestExists(
    paymentRequestId: string,
  ): Promise<void> {
    const [paymentRequest] = await this.db
      .select({ id: paymentRequests.id })
      .from(paymentRequests)
      .where(eq(paymentRequests.id, paymentRequestId))
      .limit(1);

    if (!paymentRequest) {
      throw new AppException(ErrorCode.E157, HttpStatus.NOT_FOUND);
    }
  }

  /** E157 nếu không có YCTT, E158 nếu trạng thái hiện tại không nằm trong `allowedStatuses`. */
  private async ensurePaymentRequestStatus(
    paymentRequestId: string,
    allowedStatuses: readonly PaymentRequestStatus[],
  ): Promise<void> {
    const [paymentRequest] = await this.db
      .select({ status: paymentRequests.status })
      .from(paymentRequests)
      .where(eq(paymentRequests.id, paymentRequestId))
      .limit(1);

    if (!paymentRequest) {
      throw new AppException(ErrorCode.E157, HttpStatus.NOT_FOUND);
    }
    if (!allowedStatuses.includes(paymentRequest.status)) {
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
