import {
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  StreamableFile,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import bwipjs from 'bwip-js';
import { format } from 'date-fns';
import { and, asc, eq } from 'drizzle-orm';
import { readFile } from 'fs/promises';
import { resolve, sep } from 'path';

import { groupBy } from '../../common/utils/array';
import { vnZone } from '../../common/utils/time';
import { formatQuantity } from '../../common/utils/vnd';
import { AllConfigType } from '../../config/config.type';
import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import {
  clients,
  files,
  items,
  orders,
  productionJobBomItems,
  ProductionJobBomItemType,
  productionJobIssues,
  productionJobItems,
  ProductionJobLogAction,
  productionJobLogs,
  productionJobNotes,
  productionJobOperations,
  productionJobs,
  productionJobUnits,
  productionOrders,
  units,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import {
  FormTemplateType,
  buildFormPdfFileName,
} from '../../templates/form-templates.registry';
import { PdfRendererService } from '../../templates/pdf-renderer.service';

type JobOperation = typeof productionJobOperations.$inferSelect;
type JobBomItem = typeof productionJobBomItems.$inferSelect;

interface BomOutlineRow {
  stt: string;
  code: string;
  name: string;
  quantity_per_set: string;
  quantity_per_order: string;
  stage_chain: string;
}

function latestDate(dates: (Date | null)[]): Date | null {
  return dates.reduce<Date | null>(
    (latest, date) => (date && (!latest || date > latest) ? date : latest),
    null,
  );
}

/**
 * Kế hoạch sản xuất theo công đoạn: gom công đoạn của mọi BOM item theo cùng khoá và cùng thứ tự
 * với `ProductionJobsService.getProductionJobPlanOperations`, để PDF khớp màn kế hoạch.
 *
 * Rules:
 * - Hạn = hạn muộn nhất của nhóm.
 * - Hoàn thành thực tế chỉ có khi MỌI công đoạn của nhóm đã có ngày hoàn thành, lấy ngày muộn nhất.
 * - Hạn bằng nhau thì chi tiết sâu nhất làm trước, vì `sortOrder` chỉ có nghĩa trong một node.
 */
function buildStageRows(
  jobOperations: JobOperation[],
  bomItemLevelById: Map<string, number>,
) {
  const operationsByStageKey = groupBy(jobOperations, (operation) =>
    (operation.operationId || operation.code || operation.name)
      .trim()
      .toLowerCase(),
  );

  const stages = [...operationsByStageKey.values()].map((stageOperations) => ({
    name: stageOperations[0].name,
    dueDate: latestDate(stageOperations.map((operation) => operation.dueDate)),
    completedDate: stageOperations.every((operation) => operation.completedDate)
      ? latestDate(stageOperations.map((operation) => operation.completedDate))
      : null,
    level: Math.max(
      ...stageOperations.map(
        (operation) =>
          bomItemLevelById.get(operation.productionJobBomItemId) ?? 0,
      ),
    ),
    sortOrder: Math.min(
      ...stageOperations.map((operation) => operation.sortOrder),
    ),
  }));

  return stages
    .sort(
      (stage, nextStage) =>
        (stage.dueDate?.getTime() ?? Infinity) -
          (nextStage.dueDate?.getTime() ?? Infinity) ||
        nextStage.level - stage.level ||
        stage.sortOrder - nextStage.sortOrder,
    )
    .map((stage, index) => ({
      stt: index + 1,
      stage_name: stage.name.toUpperCase(),
      due_date: stage.dueDate
        ? format(stage.dueDate, 'dd/MM/yyyy', { in: vnZone })
        : '',
      completed_date: stage.completedDate
        ? format(stage.completedDate, 'dd/MM/yyyy', { in: vnZone })
        : '',
      status: stage.completedDate ? 'Hoàn thành' : '',
    }));
}

/**
 * Cấu trúc BOM đánh số theo cây: hàng 1 là thành phẩm (SL bộ 1, SL PO = SL Job), con trực tiếp là
 * 1.1, 1.2..., cháu 1.1.1...
 *
 * Rules:
 * - Node `FG` không phải một chi tiết: nó là hàng 1 và cho chuỗi công đoạn của thành phẩm.
 * - Node gốc có `parentId` null vẫn lắp vào thành phẩm nên là con của hàng 1.
 * - Chuỗi công đoạn theo `sortOrder` trong node (`jobOperations` đã sắp sẵn), vì `successorId` của
 *   bước cuối trỏ sang node cha.
 */
function buildBomOutline(
  jobBomItems: JobBomItem[],
  jobOperations: JobOperation[],
  finishedProduct: { code: string; name: string; quantity: number },
): BomOutlineRow[] {
  const stageChainByBomItemId = new Map(
    [
      ...groupBy(
        jobOperations,
        (operation) => operation.productionJobBomItemId,
      ),
    ].map(([bomItemId, nodeOperations]) => [
      bomItemId,
      nodeOperations.map((operation) => operation.name).join(' -> '),
    ]),
  );
  const finalBomItem = jobBomItems.find(
    (bomItem) => bomItem.itemType === ProductionJobBomItemType.FG,
  );
  const componentBomItems = jobBomItems.filter(
    (bomItem) => bomItem.itemType !== ProductionJobBomItemType.FG,
  );
  const childrenByParentId = groupBy(
    [...componentBomItems].sort(
      (bomItem, nextBomItem) =>
        bomItem.sortOrder - nextBomItem.sortOrder ||
        bomItem.id.localeCompare(nextBomItem.id),
    ),
    (bomItem) => bomItem.parentId,
  );

  const outline: BomOutlineRow[] = [
    {
      stt: '1',
      code: finishedProduct.code,
      name: finishedProduct.name,
      quantity_per_set: formatQuantity(1),
      quantity_per_order: formatQuantity(finishedProduct.quantity),
      stage_chain: finalBomItem
        ? (stageChainByBomItemId.get(finalBomItem.id) ?? '')
        : '',
    },
  ];

  const appendChildren = (parentId: string | null, parentStt: string) => {
    (childrenByParentId.get(parentId) ?? []).forEach((bomItem, index) => {
      const stt = `${parentStt}.${index + 1}`;
      outline.push({
        stt,
        code: bomItem.code,
        name: bomItem.name,
        quantity_per_set: formatQuantity(bomItem.quantity),
        quantity_per_order: formatQuantity(bomItem.plannedQuantity),
        stage_chain: stageChainByBomItemId.get(bomItem.id) ?? '',
      });
      appendChildren(bomItem.id, stt);
    });
  };
  // Gốc `parentId` null là con của thành phẩm; các node sâu hơn chỉ treo theo `parentId` thật.
  appendChildren(null, '1');

  return outline;
}

@Injectable()
export class ProductionJobPdfService {
  private readonly logger = new Logger(ProductionJobPdfService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly pdfRendererService: PdfRendererService,
    private readonly configService: ConfigService<AllConfigType>,
  ) {}

  /**
   * Lệnh sản xuất theo Job (BM 08-05).
   *
   * Rules:
   * - Ghi chú lấy các ghi chú của chính Job, không có thì lấy ghi chú của LSX.
   * - Ô ký "Xác nhận kế hoạch sản xuất" là người tạo Job và ngày tạo, đọc từ log `CREATED` (Job
   *   không có cột người tạo; `operationsApprovedBy` là dữ liệu cũ, không còn được ghi).
   * - Ảnh sản phẩm thiếu file trên đĩa thì bỏ trống khung ảnh, không làm hỏng PDF.
   */
  async exportProductionJobPdf(jobId: string): Promise<StreamableFile> {
    const [job] = await this.db
      .select({
        code: productionJobs.code,
        quantity: productionJobs.quantity,
        itemRevision: productionJobs.itemRevision,
        productionOrderNote: productionOrders.note,
        buyerPoNo: orders.buyerPoNo,
        orderDate: orders.orderDate,
        dueDate: orders.dueDate,
        clientName: clients.name,
        itemCode: items.code,
        itemName: items.name,
        unitName: units.name,
        imageStorageKey: files.storageKey,
        imageMimetype: files.mimetype,
      })
      .from(productionJobs)
      .innerJoin(
        productionOrders,
        eq(productionOrders.id, productionJobs.productionOrderId),
      )
      .innerJoin(orders, eq(orders.id, productionOrders.orderId))
      .leftJoin(clients, eq(clients.id, orders.clientId))
      .innerJoin(items, eq(items.id, productionJobs.itemId))
      .leftJoin(units, eq(units.id, items.unitId))
      .leftJoin(files, eq(files.id, items.imageFileId))
      .where(eq(productionJobs.id, jobId));

    if (!job) {
      throw new AppException(ErrorCode.E082, HttpStatus.NOT_FOUND);
    }

    const [
      jobNotes,
      jobOperations,
      jobBomItems,
      jobMaterials,
      imageDataUri,
      creationLog,
    ] = await Promise.all([
      this.db
        .select({ content: productionJobNotes.content })
        .from(productionJobNotes)
        .where(eq(productionJobNotes.productionJobId, jobId))
        .orderBy(asc(productionJobNotes.createdAt)),
      this.db
        .select()
        .from(productionJobOperations)
        .where(eq(productionJobOperations.productionJobId, jobId))
        .orderBy(
          asc(productionJobOperations.sortOrder),
          asc(productionJobOperations.createdAt),
        ),
      this.db
        .select()
        .from(productionJobBomItems)
        .where(eq(productionJobBomItems.productionJobId, jobId)),
      this.db
        .select({
          code: productionJobItems.code,
          name: productionJobItems.name,
          unitName: productionJobUnits.name,
          requiredQty: productionJobIssues.requiredQty,
        })
        .from(productionJobIssues)
        .innerJoin(
          productionJobItems,
          eq(productionJobItems.id, productionJobIssues.productionJobItemId),
        )
        .innerJoin(
          productionJobUnits,
          eq(productionJobUnits.id, productionJobIssues.productionJobUnitId),
        )
        .where(eq(productionJobIssues.productionJobId, jobId))
        .orderBy(asc(productionJobItems.code), asc(productionJobIssues.id)),
      this.readImageDataUri(job.imageStorageKey, job.imageMimetype),
      this.db.query.productionJobLogs.findFirst({
        where: and(
          eq(productionJobLogs.productionJobId, jobId),
          eq(productionJobLogs.action, ProductionJobLogAction.CREATED),
        ),
        with: { performerBy: true },
      }),
    ]);

    const bomItemLevelById = new Map(
      jobBomItems.map((bomItem) => [bomItem.id, bomItem.level]),
    );

    const context = {
      job_code: job.code,
      barcode_svg: bwipjs.toSVG({
        bcid: 'code128',
        text: job.code,
        height: 8,
        includetext: false,
      }),
      order_po_code: job.buyerPoNo ?? '',
      order_date: format(job.orderDate, 'dd/MM/yyyy', { in: vnZone }),
      due_date: job.dueDate
        ? format(job.dueDate, 'dd/MM/yyyy', { in: vnZone })
        : '',
      customer_name: job.clientName ?? '',
      item_code: job.itemCode,
      item_name: job.itemName,
      revision: job.itemRevision ?? '',
      quantity: formatQuantity(job.quantity),
      unit_name: job.unitName ?? '',
      note: jobNotes.length
        ? jobNotes.map((jobNote) => jobNote.content).join('\n')
        : (job.productionOrderNote ?? ''),
      image_data_uri: imageDataUri,
      stages: buildStageRows(jobOperations, bomItemLevelById),
      materials: jobMaterials.map((material, index) => ({
        stt: index + 1,
        item_code: material.code,
        item_name: material.name,
        unit_name: material.unitName,
        quantity: formatQuantity(material.requiredQty),
      })),
      bom_items: buildBomOutline(jobBomItems, jobOperations, {
        code: job.itemCode,
        name: job.itemName,
        quantity: job.quantity,
      }),
      approver_name: creationLog?.performerBy?.fullName ?? '',
      approver_date: creationLog
        ? format(creationLog.createdAt, 'dd/MM/yyyy', { in: vnZone })
        : '',
    };

    const buffer = await this.pdfRendererService.render(
      FormTemplateType.PRODUCTION_JOB_ORDER,
      context,
    );

    const fileName = buildFormPdfFileName(
      FormTemplateType.PRODUCTION_JOB_ORDER,
      job.code,
    );
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="${fileName}"`,
    });
  }

  private async readImageDataUri(
    storageKey: string | null,
    mimetype: string | null,
  ): Promise<string> {
    if (!storageKey || !mimetype) return '';

    const uploadDir = resolve(
      this.configService.getOrThrow('upload.dir', { infer: true }),
    );
    const imagePath = resolve(uploadDir, storageKey);
    if (!imagePath.startsWith(uploadDir + sep)) return '';

    try {
      const imageBuffer = await readFile(imagePath);
      return `data:${mimetype};base64,${imageBuffer.toString('base64')}`;
    } catch (error) {
      // Thiếu file ảnh thì in khung trống; lỗi khác (quyền, cấu hình thư mục) phải để lại dấu vết.
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.logger.warn(
          `Không đọc được ảnh sản phẩm ${storageKey}: ${String(error)}`,
        );
      }
      return '';
    }
  }
}
