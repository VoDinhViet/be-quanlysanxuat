import { HttpStatus, Inject, Injectable, StreamableFile } from '@nestjs/common';
import { asc, desc, eq, getTableColumns } from 'drizzle-orm';
import { DateTime } from 'luxon';

import { formatVnDate } from '../../common/utils/excel.util';
import {
  formatQuantity,
  formatVnd,
  formatVndInWords,
} from '../../common/utils/vnd.util';
import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import {
  items,
  PaymentTerm,
  purchaseOrderItems,
  purchaseOrders,
  purchaseRequestItems,
  supplierRepresentatives,
  units,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { FormTemplateType } from '../../templates/form-templates.registry';
import { PdfRendererService } from '../../templates/pdf-renderer.service';
import { calculatePurchaseOrderAmounts } from './purchase-orders.query';

const paymentTermLabels: Record<PaymentTerm, string> = {
  [PaymentTerm.IMMEDIATE]: 'Thanh toán ngay',
  [PaymentTerm.NET_15]: 'Net 15 ngày',
  [PaymentTerm.NET_30]: 'Net 30 ngày',
  [PaymentTerm.NET_60]: 'Net 60 ngày',
};

/** Tách khỏi `PurchaseOrdersService` (đã quá dài) — chỉ đọc PO và in biểu mẫu BM 07-02. */
@Injectable()
export class PurchaseOrderPdfService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly pdfRendererService: PdfRendererService,
  ) {}

  /** Ô "Người lập" và "Phê duyệt" lấy người và ngày tạo/duyệt của báo giá gốc (`quotation`); để trống khi
   * đơn không còn báo giá. Ô nhà cung cấp để trống cho ký tay. Thành tiền dòng và các tổng dùng chung
   * công thức với màn chi tiết (`calculatePurchaseOrderAmounts`). */
  async exportPurchaseOrderPdf(
    purchaseOrderId: string,
  ): Promise<StreamableFile> {
    const [purchaseOrder, orderLines, [primaryRepresentative]] =
      await Promise.all([
        this.db.query.purchaseOrders.findFirst({
          where: eq(purchaseOrders.id, purchaseOrderId),
          with: {
            supplier: true,
            quotation: { with: { creatorBy: true, approverBy: true } },
          },
        }),
        this.db
          .select({
            item: getTableColumns(items),
            unit: getTableColumns(units),
            quantity: purchaseOrderItems.quantity,
            unitPrice: purchaseOrderItems.unitPrice,
            quotationUnit: purchaseOrderItems.quotationUnit,
            quotationQuantity: purchaseOrderItems.quotationQuantity,
          })
          .from(purchaseOrderItems)
          .innerJoin(
            purchaseRequestItems,
            eq(
              purchaseRequestItems.id,
              purchaseOrderItems.purchaseRequestItemId,
            ),
          )
          .innerJoin(items, eq(items.id, purchaseRequestItems.itemId))
          .innerJoin(units, eq(units.id, items.unitId))
          .where(eq(purchaseOrderItems.purchaseOrderId, purchaseOrderId))
          .orderBy(asc(items.code)),
        this.db
          .select({ name: supplierRepresentatives.name })
          .from(supplierRepresentatives)
          .innerJoin(
            purchaseOrders,
            eq(purchaseOrders.supplierId, supplierRepresentatives.supplierId),
          )
          .where(eq(purchaseOrders.id, purchaseOrderId))
          .orderBy(
            desc(supplierRepresentatives.isPrimary),
            asc(supplierRepresentatives.createdAt),
          )
          .limit(1),
      ]);

    if (!purchaseOrder) {
      throw new AppException(ErrorCode.E121, HttpStatus.NOT_FOUND);
    }

    const amounts = calculatePurchaseOrderAmounts({
      ...purchaseOrder,
      items: orderLines,
    });
    const { supplier, quotation } = purchaseOrder;

    const context = {
      code: purchaseOrder.code,
      order_date: formatVnDate(purchaseOrder.orderDate),
      expected_date: formatVnDate(purchaseOrder.expectedDate),
      supplier_name: supplier.name,
      supplier_address: supplier.address,
      supplier_tax_code: supplier.taxCode ?? '',
      supplier_phone: supplier.phoneNumber ?? '',
      supplier_email: supplier.email ?? '',
      supplier_contact: primaryRepresentative?.name ?? '',
      payment_term: purchaseOrder.paymentTerm
        ? paymentTermLabels[purchaseOrder.paymentTerm]
        : '',
      note: purchaseOrder.note ?? '',
      order_items: orderLines.map((line, index) => ({
        stt: index + 1,
        item_code: line.item.code,
        item_name: line.item.name,
        quantity: formatQuantity(line.quantity),
        unit_name: line.unit.name,
        converted_quantity:
          line.quotationQuantity !== null
            ? `${formatQuantity(line.quotationQuantity)} ${line.quotationUnit ?? ''}`.trim()
            : '-',
        unit_price: line.unitPrice !== null ? formatVnd(line.unitPrice) : '',
        line_total:
          line.unitPrice !== null
            ? formatVnd(
                (line.quotationQuantity ?? line.quantity) * line.unitPrice,
              )
            : '',
      })),
      subtotal: formatVnd(amounts.subtotal),
      vat_percent: formatQuantity(purchaseOrder.vatPercent),
      vat_amount: formatVnd(amounts.vatAmount),
      other_cost: formatVnd(purchaseOrder.otherCost),
      grand_total: formatVnd(amounts.totalAmount),
      advance_payment: formatVnd(purchaseOrder.advancePaymentAmount),
      balance_due: formatVnd(amounts.balanceDue),
      amount_in_words: formatVndInWords(amounts.totalAmount),
      creator_name: quotation?.creatorBy?.fullName ?? '',
      creator_date: formatVnDate(quotation?.createdAt ?? null),
      approver_name: quotation?.approverBy?.fullName ?? '',
      approver_date: formatVnDate(quotation?.approvedAt ?? null),
    };

    const buffer = await this.pdfRendererService.render(
      FormTemplateType.PURCHASE_ORDER,
      context,
    );

    const fileName = `${purchaseOrder.code}-${DateTime.now().toFormat('yyyyLLdd-HHmm')}.pdf`;
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="${fileName}"`,
    });
  }
}
