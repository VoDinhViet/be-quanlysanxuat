import { HttpStatus, Inject, Injectable, StreamableFile } from '@nestjs/common';
import { format } from 'date-fns';
import { asc, eq, sql } from 'drizzle-orm';

import { vnZone } from '../../common/utils/time';
import { formatQuantity } from '../../common/utils/vnd';
import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import {
  items,
  outsourcingOrderItems,
  outsourcingOrders,
  productionJobs,
  units,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import {
  FormTemplateType,
  buildFormPdfFileName,
} from '../../templates/form-templates.registry';
import { PdfRendererService } from '../../templates/pdf-renderer.service';

/** Chỉ đọc phiếu OS-OUT và in biểu mẫu BM 09-06. */
@Injectable()
export class OutsourcingOrderPdfService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly pdfRendererService: PdfRendererService,
  ) {}

  /** Ô "Lập phiếu" và "Phê duyệt" lấy người và thời điểm tạo/duyệt thật của phiếu; ba ô Bảo vệ, Tài xế,
   * Khách hàng ký nhận để trống cho ký tay. */
  async exportOutsourcingOrderPdf(
    outsourcingOrderId: string,
  ): Promise<StreamableFile> {
    const [outsourcingOrder, orderLines] = await Promise.all([
      this.db.query.outsourcingOrders.findFirst({
        where: eq(outsourcingOrders.id, outsourcingOrderId),
        with: { supplier: true, creatorBy: true, approverBy: true },
      }),
      this.db
        .select({
          jobCode: productionJobs.code,
          itemCode: outsourcingOrderItems.itemCode,
          itemName: outsourcingOrderItems.itemName,
          unitName: units.name,
          quantity: outsourcingOrderItems.quantity,
          weight: outsourcingOrderItems.weight,
          note: outsourcingOrderItems.note,
        })
        .from(outsourcingOrderItems)
        .leftJoin(items, eq(items.id, outsourcingOrderItems.itemId))
        .leftJoin(
          units,
          eq(
            units.id,
            sql`coalesce(${outsourcingOrderItems.unitId}, ${items.unitId})`,
          ),
        )
        .leftJoin(
          productionJobs,
          eq(productionJobs.id, outsourcingOrderItems.productionJobId),
        )
        .where(eq(outsourcingOrderItems.outsourcingOrderId, outsourcingOrderId))
        .orderBy(asc(outsourcingOrderItems.sortOrder)),
    ]);

    if (!outsourcingOrder) {
      throw new AppException(ErrorCode.E165, HttpStatus.NOT_FOUND);
    }

    const { supplier, creatorBy, approverBy } = outsourcingOrder;

    const context = {
      code: outsourcingOrder.code,
      send_date: format(outsourcingOrder.sendDate, 'dd/MM/yyyy', {
        in: vnZone,
      }),
      expected_return_date: outsourcingOrder.expectedReturnDate
        ? format(outsourcingOrder.expectedReturnDate, 'dd/MM/yyyy', {
            in: vnZone,
          })
        : '',
      supplier_name: supplier.name,
      supplier_address: supplier.address,
      supplier_tax_code: supplier.taxCode ?? '',
      note: outsourcingOrder.note ?? '',
      order_items: orderLines.map((line, index) => ({
        stt: index + 1,
        job_code: line.jobCode ?? '',
        item_code: line.itemCode,
        item_name: line.itemName,
        unit_name: line.unitName ?? '',
        quantity: formatQuantity(line.quantity),
        // `weight` là SL quy đổi theo kg.
        converted_quantity: line.weight
          ? `${formatQuantity(line.weight)} kg`
          : '-',
        note: line.note ?? '',
      })),
      creator_name: creatorBy?.fullName ?? '',
      creator_date: format(outsourcingOrder.createdAt, 'dd/MM/yyyy', {
        in: vnZone,
      }),
      approver_name: approverBy?.fullName ?? '',
      approver_date: outsourcingOrder.approvedAt
        ? format(outsourcingOrder.approvedAt, 'dd/MM/yyyy', { in: vnZone })
        : '',
    };

    const buffer = await this.pdfRendererService.render(
      FormTemplateType.OUTSOURCING_SEND_SLIP,
      context,
    );

    const fileName = buildFormPdfFileName(
      FormTemplateType.OUTSOURCING_SEND_SLIP,
      outsourcingOrder.code,
    );
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="${fileName}"`,
    });
  }
}
