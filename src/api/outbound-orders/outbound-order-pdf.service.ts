import { HttpStatus, Inject, Injectable, StreamableFile } from '@nestjs/common';
import { format } from 'date-fns';
import { asc, eq } from 'drizzle-orm';

import { vnZone } from '../../common/utils/time';
import { formatQuantity } from '../../common/utils/vnd';
import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import {
  items,
  orderItems,
  orders,
  outboundOrderItems,
  outboundOrders,
  units,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import {
  FormTemplateType,
  buildFormPdfFileName,
} from '../../templates/form-templates.registry';
import { PdfRendererService } from '../../templates/pdf-renderer.service';

/** Chỉ đọc phiếu giao hàng và in biểu mẫu BM 09-04. */
@Injectable()
export class OutboundOrderPdfService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly pdfRendererService: PdfRendererService,
  ) {}

  /** Ô "Lập phiếu" và "Phê duyệt" lấy người và ngày tạo/duyệt của phiếu; "Người giao hàng" và
   * "Người nhận hàng" để trống cho ký tay.
   *
   * Rules:
   * - "Mã đơn hàng" in số PO của khách (`buyerPoNo`), đơn không có thì dùng mã đơn nội bộ.
   * - Địa chỉ giao lấy từ phiếu; phiếu khách tự đến lấy (không có địa chỉ) dùng địa chỉ nhận hàng
   *   của đơn hàng ở dòng đầu tiên. */
  async exportOutboundOrderPdf(
    outboundOrderId: string,
  ): Promise<StreamableFile> {
    const [outboundOrder, deliveryLines] = await Promise.all([
      this.db.query.outboundOrders.findFirst({
        where: eq(outboundOrders.id, outboundOrderId),
        with: { client: true, creatorBy: true, approverBy: true },
      }),
      this.db
        .select({
          buyerPoNo: orders.buyerPoNo,
          orderCode: orders.code,
          consigneeAddress: orders.consigneeAddress,
          itemName: items.name,
          unitName: units.name,
          quantity: outboundOrderItems.quantity,
          note: outboundOrderItems.note,
        })
        .from(outboundOrderItems)
        .innerJoin(items, eq(items.id, outboundOrderItems.itemId))
        .innerJoin(units, eq(units.id, items.unitId))
        .innerJoin(
          orderItems,
          eq(orderItems.id, outboundOrderItems.orderItemId),
        )
        .innerJoin(orders, eq(orders.id, orderItems.orderId))
        .where(eq(outboundOrderItems.outboundOrderId, outboundOrderId))
        .orderBy(asc(outboundOrderItems.sortOrder)),
    ]);

    if (!outboundOrder) {
      throw new AppException(ErrorCode.E195, HttpStatus.NOT_FOUND);
    }

    const { client } = outboundOrder;

    const context = {
      code: outboundOrder.code,
      fulfillment_date: format(outboundOrder.fulfillmentDate, 'dd/MM/yyyy', {
        in: vnZone,
      }),
      client_name: client.name,
      delivery_address:
        (outboundOrder.deliveryAddress || deliveryLines[0]?.consigneeAddress) ??
        '',
      client_tax_code: client.taxCode ?? '',
      client_phone: client.phoneNumber ?? outboundOrder.receiverPhone ?? '',
      receiver_name: outboundOrder.receiverName ?? '',
      client_email: client.email ?? '',
      delivery_items: deliveryLines.map((line, index) => ({
        stt: index + 1,
        order_code: line.buyerPoNo ?? line.orderCode,
        item_name: line.itemName,
        unit_name: line.unitName,
        quantity: formatQuantity(line.quantity),
        note: line.note ?? '',
      })),
      note: outboundOrder.note ?? '',
      creator_name: outboundOrder.creatorBy?.fullName ?? '',
      creator_date: format(outboundOrder.createdAt, 'dd/MM/yyyy', {
        in: vnZone,
      }),
      approver_name: outboundOrder.approverBy?.fullName ?? '',
      approver_date: outboundOrder.approvedAt
        ? format(outboundOrder.approvedAt, 'dd/MM/yyyy', { in: vnZone })
        : '',
    };

    const buffer = await this.pdfRendererService.render(
      FormTemplateType.DELIVERY_NOTE,
      context,
    );

    const fileName = buildFormPdfFileName(
      FormTemplateType.DELIVERY_NOTE,
      outboundOrder.code,
    );
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="${fileName}"`,
    });
  }
}
