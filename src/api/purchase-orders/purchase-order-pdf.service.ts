import { HttpStatus, Inject, Injectable, StreamableFile } from '@nestjs/common';
import { format } from 'date-fns';
import { asc, desc, eq, getTableColumns } from 'drizzle-orm';

import { vnZone } from '../../common/utils/time';
import { formatQuantity, formatVnd } from '../../common/utils/vnd';
import { ErrorCode } from '../../constants/error-code.constant';
import { PAYMENT_TERM_LABELS } from '../../constants/payment-term.constant';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import {
  items,
  purchaseOrderItems,
  purchaseOrders,
  purchaseRequestItems,
  supplierRepresentatives,
  units,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import {
  FormTemplateType,
  buildFormPdfFileName,
} from '../../templates/form-templates.registry';
import { PdfRendererService } from '../../templates/pdf-renderer.service';
import { calculatePurchaseOrderAmounts } from './purchase-orders.query';

/** Chỉ đọc PO và in biểu mẫu BM 05-04. */
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
      order_date: format(purchaseOrder.orderDate, 'dd/MM/yyyy', { in: vnZone }),
      expected_date: purchaseOrder.expectedDate
        ? format(purchaseOrder.expectedDate, 'dd/MM/yyyy', { in: vnZone })
        : '',
      supplier_name: supplier.name,
      supplier_address: supplier.address,
      supplier_tax_code: supplier.taxCode ?? '',
      supplier_phone: supplier.phoneNumber ?? '',
      supplier_email: supplier.email ?? '',
      supplier_contact: primaryRepresentative?.name ?? '',
      payment_term: purchaseOrder.paymentTerm
        ? PAYMENT_TERM_LABELS[purchaseOrder.paymentTerm]
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
      creator_name: quotation?.creatorBy?.fullName ?? '',
      creator_date: quotation?.createdAt
        ? format(quotation.createdAt, 'dd/MM/yyyy', { in: vnZone })
        : '',
      approver_name: quotation?.approverBy?.fullName ?? '',
      approver_date: quotation?.approvedAt
        ? format(quotation.approvedAt, 'dd/MM/yyyy', { in: vnZone })
        : '',
    };

    const buffer = await this.pdfRendererService.render(
      FormTemplateType.PURCHASE_ORDER,
      context,
    );

    const fileName = buildFormPdfFileName(
      FormTemplateType.PURCHASE_ORDER,
      purchaseOrder.code,
    );
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="${fileName}"`,
    });
  }
}
