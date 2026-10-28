import { HttpStatus, Inject, Injectable, StreamableFile } from '@nestjs/common';
import { asc, eq, getTableColumns } from 'drizzle-orm';
import { DateTime } from 'luxon';

import { formatVnDate } from '../../common/utils/excel.util';
import { formatQuantity } from '../../common/utils/vnd.util';
import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import {
  inventoryRequisitionItems,
  inventoryRequisitions,
  InventoryRequisitionType,
  items,
  units,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { FormTemplateType } from '../../templates/form-templates.registry';
import { PdfRendererService } from '../../templates/pdf-renderer.service';

/** Các ô ký trên phiếu để trống cho ký tay, nên không nạp người tạo / người duyệt. */
@Injectable()
export class InventoryRequisitionPdfService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly pdfRendererService: PdfRendererService,
  ) {}

  /** "PO / Lý do" cùng quy tắc với phiếu xuất sinh ra từ phiếu lãnh: lãnh cho LSX → số PO của đơn
   * hàng, lãnh khác → lý do lãnh. */
  async exportInventoryRequisitionPdf(
    requisitionId: string,
  ): Promise<StreamableFile> {
    const [inventoryRequisition, requisitionLines] = await Promise.all([
      this.db.query.inventoryRequisitions.findFirst({
        where: eq(inventoryRequisitions.id, requisitionId),
        with: {
          department: true,
          productionOrder: {
            with: { order: { columns: { buyerPoNo: true } } },
          },
          productionJob: true,
          creatorBy: true,
        },
      }),
      this.db
        .select({
          item: getTableColumns(items),
          unit: getTableColumns(units),
          quantity: inventoryRequisitionItems.quantity,
          note: inventoryRequisitionItems.note,
        })
        .from(inventoryRequisitionItems)
        .innerJoin(items, eq(items.id, inventoryRequisitionItems.itemId))
        .innerJoin(units, eq(units.id, inventoryRequisitionItems.unitId))
        .where(eq(inventoryRequisitionItems.requisitionId, requisitionId))
        .orderBy(
          asc(inventoryRequisitionItems.sortOrder),
          asc(inventoryRequisitionItems.createdAt),
        ),
    ]);

    if (!inventoryRequisition) {
      throw new AppException(ErrorCode.E223, HttpStatus.NOT_FOUND);
    }

    const source =
      inventoryRequisition.type === InventoryRequisitionType.PRODUCTION
        ? inventoryRequisition.productionOrder?.order.buyerPoNo
        : inventoryRequisition.reason;

    const context = {
      code: inventoryRequisition.code,
      requisition_date: formatVnDate(inventoryRequisition.requisitionDate),
      source: source ?? '',
      job_code: inventoryRequisition.productionJob?.code ?? '',
      department_name: inventoryRequisition.department?.name ?? '',
      note: inventoryRequisition.note ?? '',
      creator_name: inventoryRequisition.creatorBy?.fullName ?? '',
      creator_date: formatVnDate(new Date()),
      requisition_items: requisitionLines.map((line, index) => ({
        stt: index + 1,
        item_code: line.item.code,
        item_name: line.item.name,
        unit_name: line.unit.name,
        quantity: formatQuantity(line.quantity),
        note: line.note ?? '',
      })),
    };

    const buffer = await this.pdfRendererService.render(
      FormTemplateType.MATERIAL_REQUISITION,
      context,
    );

    const fileName = `${inventoryRequisition.code}-${DateTime.now().toFormat('yyyyLLdd-HHmm')}.pdf`;
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="${fileName}"`,
    });
  }
}
