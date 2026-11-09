import { HttpStatus, Inject, Injectable, StreamableFile } from '@nestjs/common';
import { format } from 'date-fns';
import { and, asc, eq, isNotNull, ne, sql } from 'drizzle-orm';

import { vnZone } from '../../common/utils/time';
import { formatQuantity } from '../../common/utils/vnd';
import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import {
  items,
  outsourcingOrderItems,
  outsourcingOrders,
  outsourcingReceiptItems,
  outsourcingReceipts,
  productionJobs,
  QualityInspectionOriginType,
  QualityInspectionStatus,
  QualityInspectionType,
  qualityInspections,
  units,
  users,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import {
  FormTemplateType,
  buildFormPdfFileName,
} from '../../templates/form-templates.registry';
import { PdfRendererService } from '../../templates/pdf-renderer.service';

/** Chỉ đọc phiếu OS-IN và in biểu mẫu BM 09-07. */
@Injectable()
export class OutsourcingReceiptPdfService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly pdfRendererService: PdfRendererService,
  ) {}

  /** Một phiếu nhận có thể gồm dòng của nhiều phiếu OS-OUT cùng nhà cung cấp nên "Mã phiếu xuất" là
   * các mã khác nhau nối bằng dấu phẩy.
   *
   * Rules:
   * - Ô QC lấy người kiểm (`inspectedBy`) và ngày bắt đầu kiểm (`startedAt`) của IQC không huỷ đầu
   *   tiên (theo `requestedAt`) trong các dòng của phiếu; chưa có IQC thì để trống.
   * - Ô "Xác nhận nhập kho" lấy người và thời điểm ghi nhận (`postedBy`, `postedAt`). */
  async exportOutsourcingReceiptPdf(
    outsourcingReceiptId: string,
  ): Promise<StreamableFile> {
    const [outsourcingReceipt, receiptLines, [firstInspection]] =
      await Promise.all([
        this.db.query.outsourcingReceipts.findFirst({
          where: eq(outsourcingReceipts.id, outsourcingReceiptId),
          with: { supplier: true, creatorBy: true, posterBy: true },
        }),
        this.db
          .select({
            orderCode: outsourcingOrders.code,
            jobCode: productionJobs.code,
            itemCode: outsourcingReceiptItems.itemCode,
            itemName: outsourcingReceiptItems.itemName,
            unitName: units.name,
            quantity: outsourcingReceiptItems.quantity,
            weight: outsourcingReceiptItems.weight,
            note: outsourcingReceiptItems.note,
          })
          .from(outsourcingReceiptItems)
          .innerJoin(
            outsourcingOrderItems,
            eq(
              outsourcingOrderItems.id,
              outsourcingReceiptItems.outsourcingOrderItemId,
            ),
          )
          .innerJoin(
            outsourcingOrders,
            eq(outsourcingOrders.id, outsourcingOrderItems.outsourcingOrderId),
          )
          .leftJoin(items, eq(items.id, outsourcingReceiptItems.itemId))
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
          .where(
            eq(
              outsourcingReceiptItems.outsourcingReceiptId,
              outsourcingReceiptId,
            ),
          )
          .orderBy(asc(outsourcingReceiptItems.sortOrder)),
        this.db
          .select({
            inspectorName: users.fullName,
            startedAt: qualityInspections.startedAt,
          })
          .from(qualityInspections)
          .innerJoin(
            outsourcingReceiptItems,
            and(
              eq(
                qualityInspections.originType,
                QualityInspectionOriginType.OUTSOURCING_RECEIPT_ITEM,
              ),
              eq(qualityInspections.originId, outsourcingReceiptItems.id),
            ),
          )
          .leftJoin(users, eq(users.id, qualityInspections.inspectedBy))
          .where(
            and(
              eq(qualityInspections.inspectionType, QualityInspectionType.IQC),
              ne(qualityInspections.status, QualityInspectionStatus.CANCELLED),
              isNotNull(qualityInspections.inspectedBy),
              eq(
                outsourcingReceiptItems.outsourcingReceiptId,
                outsourcingReceiptId,
              ),
            ),
          )
          .orderBy(asc(qualityInspections.requestedAt))
          .limit(1),
      ]);

    if (!outsourcingReceipt) {
      throw new AppException(ErrorCode.E170, HttpStatus.NOT_FOUND);
    }

    const { supplier, creatorBy, posterBy } = outsourcingReceipt;
    const orderCodes = [...new Set(receiptLines.map((line) => line.orderCode))];

    const context = {
      code: outsourcingReceipt.code,
      order_codes: orderCodes.join(', '),
      receipt_date: format(outsourcingReceipt.receiptDate, 'dd/MM/yyyy', {
        in: vnZone,
      }),
      supplier_name: supplier.name,
      supplier_address: supplier.address,
      supplier_tax_code: supplier.taxCode ?? '',
      note: outsourcingReceipt.note ?? '',
      receipt_items: receiptLines.map((line, index) => ({
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
      creator_date: format(outsourcingReceipt.createdAt, 'dd/MM/yyyy', {
        in: vnZone,
      }),
      qc_name: firstInspection?.inspectorName ?? '',
      qc_date: firstInspection?.startedAt
        ? format(firstInspection.startedAt, 'dd/MM/yyyy', { in: vnZone })
        : '',
      poster_name: posterBy?.fullName ?? '',
      poster_date: outsourcingReceipt.postedAt
        ? format(outsourcingReceipt.postedAt, 'dd/MM/yyyy', { in: vnZone })
        : '',
    };

    const buffer = await this.pdfRendererService.render(
      FormTemplateType.OUTSOURCING_RECEIVE_SLIP,
      context,
    );

    const fileName = buildFormPdfFileName(
      FormTemplateType.OUTSOURCING_RECEIVE_SLIP,
      outsourcingReceipt.code,
    );
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="${fileName}"`,
    });
  }
}
