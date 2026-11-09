import { HttpStatus, Inject, Injectable, StreamableFile } from '@nestjs/common';
import { format } from 'date-fns';
import { eq } from 'drizzle-orm';

import { vnZone } from '../../common/utils/time';
import { formatQuantity } from '../../common/utils/vnd';
import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import { supplierReturns, units } from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import {
  FormTemplateType,
  buildFormPdfFileName,
} from '../../templates/form-templates.registry';
import { PdfRendererService } from '../../templates/pdf-renderer.service';

/** Chỉ đọc phiếu trả NCC và in biểu mẫu BM 09-08. */
@Injectable()
export class SupplierReturnPdfService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly pdfRendererService: PdfRendererService,
  ) {}

  /** Phiếu trả NCC phẳng nên bảng chỉ có đúng 1 dòng.
   *
   * Rules:
   * - Ô "Phê duyệt" lấy người duyệt và ngày duyệt của phiếu IQC gốc; để trống khi IQC chưa duyệt.
   * - "Số lượng (quy đổi thực tế)" luôn in `-`: DB không lưu quy đổi cho số lượng trả.
   * - Ô "Khách hàng" để trống cho ký tay. */
  async exportSupplierReturnPdf(
    supplierReturnId: string,
  ): Promise<StreamableFile> {
    const supplierReturn = await this.db.query.supplierReturns.findFirst({
      where: eq(supplierReturns.id, supplierReturnId),
      with: {
        item: { with: { unit: true } },
        supplier: true,
        qualityInspection: { with: { approverBy: true } },
        qualityInspectionResult: true,
        creatorBy: true,
        posterBy: true,
        outsourcingReceiptItem: {
          with: { outsourcingOrderItem: { columns: { unitId: true } } },
        },
      },
    });

    if (!supplierReturn) {
      throw new AppException(ErrorCode.E137, HttpStatus.NOT_FOUND);
    }

    const { item, supplier, qualityInspection } = supplierReturn;

    // Dòng COMPONENT (không có `item`) lấy đơn vị theo dòng gửi gia công ngoài nguồn.
    const componentUnitId =
      supplierReturn.outsourcingReceiptItem?.outsourcingOrderItem.unitId;
    const componentUnit =
      !item && componentUnitId
        ? await this.db.query.units.findFirst({
            where: eq(units.id, componentUnitId),
          })
        : undefined;

    const context = {
      supplier_name: supplier.name,
      supplier_address: supplier.address,
      supplier_tax_code: supplier.taxCode ?? '',
      return_reason:
        supplierReturn.note ??
        supplierReturn.qualityInspectionResult?.dispositionNote ??
        '',
      code: supplierReturn.code,
      iqc_code: qualityInspection?.inspectionNo ?? '',
      return_date: format(supplierReturn.returnDate, 'dd/MM/yyyy', {
        in: vnZone,
      }),
      note: supplierReturn.postNote ?? '',
      return_items: [
        {
          stt: 1,
          item_code: item?.code ?? supplierReturn.itemCode ?? '',
          item_name: item?.name ?? supplierReturn.itemName ?? '',
          unit_name: item?.unit.name ?? componentUnit?.name ?? '',
          quantity: formatQuantity(supplierReturn.quantity),
          converted_quantity: '-',
          note: '',
        },
      ],
      qc_name: supplierReturn.creatorBy?.fullName ?? '',
      qc_date: format(supplierReturn.createdAt, 'dd/MM/yyyy', { in: vnZone }),
      poster_name: supplierReturn.posterBy?.fullName ?? '',
      poster_date: supplierReturn.postedAt
        ? format(supplierReturn.postedAt, 'dd/MM/yyyy', { in: vnZone })
        : '',
      approver_name: qualityInspection?.approverBy?.fullName ?? '',
      approver_date: qualityInspection?.approvedAt
        ? format(qualityInspection.approvedAt, 'dd/MM/yyyy', { in: vnZone })
        : '',
    };

    const buffer = await this.pdfRendererService.render(
      FormTemplateType.SUPPLIER_RETURN_SLIP,
      context,
    );

    const fileName = buildFormPdfFileName(
      FormTemplateType.SUPPLIER_RETURN_SLIP,
      supplierReturn.code,
    );
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="${fileName}"`,
    });
  }
}
