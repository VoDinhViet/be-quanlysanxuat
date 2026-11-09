import { HttpStatus, Inject, Injectable, StreamableFile } from '@nestjs/common';
import { format } from 'date-fns';
import { asc, eq, getTableColumns } from 'drizzle-orm';

import { vnZone } from '../../common/utils/time';
import { formatQuantity } from '../../common/utils/vnd';
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
import {
  FormTemplateType,
  buildFormPdfFileName,
} from '../../templates/form-templates.registry';
import { PdfRendererService } from '../../templates/pdf-renderer.service';

@Injectable()
export class InventoryRequisitionPdfService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly pdfRendererService: PdfRendererService,
  ) {}

  /** "PO / Lý do" cùng quy tắc với phiếu xuất sinh ra từ phiếu lãnh: lãnh cho LSX → số PO của đơn
   * hàng, lãnh khác → lý do lãnh. Hai ô ký là người tạo và người duyệt phiếu lãnh. */
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
          approverBy: true,
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
      requisition_date: format(
        inventoryRequisition.requisitionDate,
        'dd/MM/yyyy',
        { in: vnZone },
      ),
      source: source ?? '',
      job_code: inventoryRequisition.productionJob?.code ?? '',
      department_name: inventoryRequisition.department?.name ?? '',
      note: inventoryRequisition.note ?? '',
      creator_name: inventoryRequisition.creatorBy?.fullName ?? '',
      creator_date: format(inventoryRequisition.createdAt, 'dd/MM/yyyy', {
        in: vnZone,
      }),
      approver_name: inventoryRequisition.approverBy?.fullName ?? '',
      approver_date: inventoryRequisition.approvedAt
        ? format(inventoryRequisition.approvedAt, 'dd/MM/yyyy', { in: vnZone })
        : '',
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

    const fileName = buildFormPdfFileName(
      FormTemplateType.MATERIAL_REQUISITION,
      inventoryRequisition.code,
    );
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="${fileName}"`,
    });
  }
}
