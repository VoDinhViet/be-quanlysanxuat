import { HttpStatus, Inject, Injectable, StreamableFile } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { format } from 'date-fns';
import {
  and,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lt,
  or,
} from 'drizzle-orm';

import { OffsetPaginationDto } from '../../common/dto/offset-pagination/offset-pagination.dto';
import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import {
  DocumentType,
  generateDocumentSequence,
} from '../../common/utils/document-sequence.util';
import { unaccentILike } from '../../common/utils/search.util';
import { getFileTimestamp, vnZone } from '../../common/utils/time';
import { formatQuantity } from '../../common/utils/vnd.util';
import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import type { Database, DbTransaction } from '../../database/database.type';
import {
  departments,
  InventoryDocumentStatus,
  InventoryIssueType,
  inventoryIssueFiles,
  inventoryIssueItems,
  inventoryIssues,
  InventoryReferenceType,
  inventoryRequisitions,
  InventoryRequisitionStatus,
  InventoryRequisitionType,
  InventoryTransactionType,
  items,
  ItemType,
  orderItems,
  outboundOrders,
  OutboundOrderStatus,
  productionJobs,
  productionOrders,
  users,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { FormTemplateType } from '../../templates/form-templates.registry';
import { PdfRendererService } from '../../templates/pdf-renderer.service';
import { hasPendingIqcForItems } from '../iqc/iqc.query';
import { FilesService } from '../files/files.service';
import { InventoryPostingService } from '../inventory/inventory-posting.service';
import { closeOrdersIfFullyDelivered } from '../outbound-orders/outbound-orders.query';
import { CreateInventoryIssueReqDto } from './dto/create-inventory-issue.req.dto';
import { GetInventoryIssuesReqDto } from './dto/get-inventory-issues.req.dto';
import { InventoryIssueItemReqDto } from './dto/inventory-issue-item.req.dto';
import { InventoryIssueResDto } from './dto/inventory-issue.res.dto';
import { PostInventoryIssueReqDto } from './dto/post-inventory-issue.req.dto';
import { PageInventoryIssueResDto } from './dto/page-inventory-issue.res.dto';
import { UpdateInventoryIssueReqDto } from './dto/update-inventory-issue.req.dto';

/** Loại phiếu → loại bút toán lúc `post` — bảng đầy đủ ở `docs/CODEMAPS/inventory.md`. */
const issueTypeTransactionType: Record<
  InventoryIssueType,
  InventoryTransactionType
> = {
  [InventoryIssueType.SALES]: InventoryTransactionType.ISSUE,
  [InventoryIssueType.RETURN]: InventoryTransactionType.ISSUE,
  [InventoryIssueType.PRODUCTION]: InventoryTransactionType.PRODUCTION_OUT,
};

type RequisitionOfIssue = {
  id: string;
  code: string;
  type: InventoryRequisitionType;
  reason: string | null;
};

/** Cột "PO / Lý do" của danh sách phiếu xuất, theo phiếu lãnh sinh ra phiếu: lãnh từ LSX → số PO của
 * đơn hàng; lãnh khác → lý do lãnh. Phiếu không có phiếu lãnh (tạo tay) → ghi chú phiếu. */
function resolvePoOrReason(
  requisition: RequisitionOfIssue | null,
  buyerPoNo: string | null,
  note: string | null,
): string | null {
  if (!requisition) return note;

  return requisition.type === InventoryRequisitionType.PRODUCTION
    ? buyerPoNo
    : requisition.reason;
}

@Injectable()
export class InventoryIssuesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly inventoryPostingService: InventoryPostingService,
    private readonly filesService: FilesService,
    private readonly pdfRendererService: PdfRendererService,
  ) {}

  async getInventoryIssues(
    reqDto: GetInventoryIssuesReqDto,
  ): Promise<OffsetPaginatedDto<PageInventoryIssueResDto>> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;
    const where = and(
      // Tìm theo mã phiếu, lý do/PO (note), mã LSX/Job hoặc mã/tên vật tư trong dòng phiếu. Dùng
      // `inArray` + subquery độc lập: relational query đặt alias cho bảng chính nên `exists` tương
      // quan sẽ vỡ SQL.
      keyword
        ? or(
            unaccentILike(inventoryIssues.code, keyword),
            unaccentILike(inventoryIssues.note, keyword),
            inArray(
              inventoryIssues.productionOrderId,
              this.db
                .select({ id: productionOrders.id })
                .from(productionOrders)
                .where(unaccentILike(productionOrders.code, keyword)),
            ),
            inArray(
              inventoryIssues.productionJobId,
              this.db
                .select({ id: productionJobs.id })
                .from(productionJobs)
                .where(unaccentILike(productionJobs.code, keyword)),
            ),
            inArray(
              inventoryIssues.id,
              this.db
                .select({ issueId: inventoryIssueItems.issueId })
                .from(inventoryIssueItems)
                .innerJoin(items, eq(items.id, inventoryIssueItems.itemId))
                .where(
                  or(
                    unaccentILike(items.code, keyword),
                    unaccentILike(items.name, keyword),
                  ),
                ),
            ),
          )
        : undefined,
      reqDto.issueType
        ? eq(inventoryIssues.issueType, reqDto.issueType)
        : undefined,
      reqDto.status ? eq(inventoryIssues.status, reqDto.status) : undefined,
      reqDto.productionOrderId
        ? eq(inventoryIssues.productionOrderId, reqDto.productionOrderId)
        : undefined,
      reqDto.productionJobId
        ? eq(inventoryIssues.productionJobId, reqDto.productionJobId)
        : undefined,
      reqDto.departmentId
        ? eq(inventoryIssues.departmentId, reqDto.departmentId)
        : undefined,
      reqDto.startDate
        ? gte(inventoryIssues.issueDate, reqDto.startDate)
        : undefined,
      // Exclusive next-day boundary — `endDate` parses to midnight UTC, `lte` would drop same-day rows.
      reqDto.endDate
        ? lt(
            inventoryIssues.issueDate,
            new Date(reqDto.endDate.getTime() + 24 * 60 * 60 * 1000),
          )
        : undefined,
    );

    const [entities, [{ total }]] = await Promise.all([
      this.db.query.inventoryIssues.findMany({
        where,
        limit: reqDto.limit,
        offset: reqDto.offset,
        orderBy: [
          desc(inventoryIssues.issueDate),
          desc(inventoryIssues.createdAt),
        ],
        with: {
          productionOrder: {
            with: { order: { columns: { buyerPoNo: true } } },
          },
          productionJob: true,
          outboundOrder: {
            columns: { id: true, code: true },
            with: { client: { columns: { id: true, code: true, name: true } } },
          },
          department: true,
          requesterBy: true,
          posterBy: true,
          creatorBy: true,
          items: { with: { item: true, unit: true } },
        },
      }),
      this.db.select({ total: count() }).from(inventoryIssues).where(where),
    ]);

    const requisitionByIssueId = await this.getRequisitionsByIssueIds(
      entities.map((entity) => entity.id),
    );

    return new OffsetPaginatedDto(
      plainToInstance(
        PageInventoryIssueResDto,
        entities.map((entity) => {
          const requisition = requisitionByIssueId.get(entity.id) ?? null;

          return {
            ...entity,
            requisition,
            poOrReason: resolvePoOrReason(
              requisition,
              entity.productionOrder?.order.buyerPoNo ?? null,
              entity.note,
            ),
          };
        }),
        {
          excludeExtraneousValues: true,
        },
      ),
      new OffsetPaginationDto(total, reqDto),
    );
  }

  private async getRequisitionsByIssueIds(
    issueIds: string[],
  ): Promise<Map<string, RequisitionOfIssue>> {
    if (!issueIds.length) return new Map();

    const requisitions = await this.db
      .select({
        id: inventoryRequisitions.id,
        code: inventoryRequisitions.code,
        type: inventoryRequisitions.type,
        reason: inventoryRequisitions.reason,
        issueId: inventoryRequisitions.inventoryIssueId,
      })
      .from(inventoryRequisitions)
      .where(inArray(inventoryRequisitions.inventoryIssueId, issueIds));

    return new Map(
      requisitions.flatMap((requisition) =>
        requisition.issueId ? [[requisition.issueId, requisition]] : [],
      ),
    );
  }

  async getInventoryIssue(issueId: string): Promise<InventoryIssueResDto> {
    const inventoryIssue = await this.db.query.inventoryIssues.findFirst({
      where: eq(inventoryIssues.id, issueId),
      with: {
        productionOrder: true,
        productionJob: true,
        outboundOrder: {
          columns: { id: true, code: true },
          with: { client: { columns: { id: true, code: true, name: true } } },
        },
        department: true,
        requesterBy: true,
        posterBy: true,
        creatorBy: true,
        items: { with: { item: true, unit: true } },
        files: {
          with: { file: true },
          orderBy: (issueFiles, { asc }) => [
            asc(issueFiles.createdAt),
            asc(issueFiles.id),
          ],
        },
      },
    });

    if (!inventoryIssue) {
      throw new AppException(ErrorCode.E096, HttpStatus.NOT_FOUND);
    }

    const requisitionByIssueId = await this.getRequisitionsByIssueIds([
      issueId,
    ]);

    return plainToInstance(
      InventoryIssueResDto,
      {
        ...inventoryIssue,
        files: inventoryIssue.files.map((issueFile) => issueFile.file),
        requisition: requisitionByIssueId.get(issueId) ?? null,
      },
      { excludeExtraneousValues: true },
    );
  }

  /** "PO / Lý do" dùng chung quy tắc với cột của danh sách (`resolvePoOrReason`); người lãnh in ra
   * là `requesterBy` của phiếu lãnh sinh ra phiếu xuất. */
  async exportInventoryIssuePdf(issueId: string): Promise<StreamableFile> {
    const [inventoryIssue, requisitionByIssueId] = await Promise.all([
      this.db.query.inventoryIssues.findFirst({
        where: eq(inventoryIssues.id, issueId),
        with: {
          productionOrder: {
            with: { order: { columns: { buyerPoNo: true } } },
          },
          productionJob: true,
          department: true,
          requesterBy: true,
          creatorBy: true,
          items: {
            with: { item: true, unit: true },
            orderBy: (issueItems, { asc }) => [asc(issueItems.createdAt)],
          },
        },
      }),
      this.getRequisitionsByIssueIds([issueId]),
    ]);

    if (!inventoryIssue) {
      throw new AppException(ErrorCode.E096, HttpStatus.NOT_FOUND);
    }

    const requisition = requisitionByIssueId.get(issueId) ?? null;

    const context = {
      code: inventoryIssue.code,
      requisition_code: requisition?.code ?? '',
      issue_date: format(inventoryIssue.issueDate, 'dd/MM/yyyy', {
        in: vnZone,
      }),
      department_name: inventoryIssue.department?.name ?? '',
      requester_name: inventoryIssue.requesterBy?.fullName ?? '',
      creator_name: inventoryIssue.creatorBy?.fullName ?? '',
      creator_date: format(new Date(), 'dd/MM/yyyy', { in: vnZone }),
      source:
        resolvePoOrReason(
          requisition,
          inventoryIssue.productionOrder?.order.buyerPoNo ?? null,
          inventoryIssue.note,
        ) ?? '',
      job_code: inventoryIssue.productionJob?.code ?? '',
      issue_items: inventoryIssue.items.map((issueItem, index) => ({
        stt: index + 1,
        item_code: issueItem.item.code,
        item_name: issueItem.item.name,
        unit_name: issueItem.unit.name,
        quantity: formatQuantity(issueItem.quantity),
        note: issueItem.note ?? '',
      })),
    };

    const buffer = await this.pdfRendererService.render(
      FormTemplateType.STOCK_OUT_SLIP,
      context,
    );

    const fileName = `${inventoryIssue.code}-${getFileTimestamp()}.pdf`;
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="${fileName}"`,
    });
  }

  async createInventoryIssue(
    reqDto: CreateInventoryIssueReqDto,
    userId: string,
  ): Promise<void> {
    this.ensureNotDirectProductionIssue(reqDto.issueType);
    const baseUnitByItemId = await this.ensureItemsValid(reqDto.items);
    await this.ensureReferencesValid(reqDto);

    const { items: itemsToCreate, ...issueFields } = reqDto;

    await this.db.transaction(async (tx) => {
      const code = await this.generateIssueCode(tx, reqDto.issueDate);

      const [inventoryIssue] = await tx
        .insert(inventoryIssues)
        .values({ ...issueFields, code, createdBy: userId })
        .returning();

      await this.createIssueItems(
        tx,
        inventoryIssue.id,
        itemsToCreate,
        baseUnitByItemId,
      );
    });
  }

  async updateInventoryIssue(
    issueId: string,
    reqDto: UpdateInventoryIssueReqDto,
  ): Promise<void> {
    const draftIssue = await this.ensureIssueDraft(issueId);
    if (draftIssue.outboundOrderId) {
      throw new AppException(ErrorCode.E319, HttpStatus.CONFLICT);
    }

    this.ensureNotDirectProductionIssue(reqDto.issueType);
    const baseUnitByItemId = await this.ensureItemsValid(reqDto.items);
    await this.ensureReferencesValid(reqDto);

    const { items: itemsToReplace, ...issueFields } = reqDto;

    await this.db.transaction(async (tx) => {
      await tx
        .update(inventoryIssues)
        .set(issueFields)
        .where(eq(inventoryIssues.id, issueId));

      await this.replaceIssueItems(
        tx,
        issueId,
        itemsToReplace,
        baseUnitByItemId,
      );
    });
  }

  /** Phiếu do phiếu lãnh sinh ra (`inventoryRequisitions.inventoryIssueId`) bị chặn xoá (`E235`):
   * FK `set null` sẽ âm thầm gỡ liên kết, để phiếu lãnh kẹt `APPROVED` mà không còn PXK. Đường đúng
   * là `InventoryRequisitionsService.cancelInventoryRequisition`. Phiếu sinh từ DO bị chặn `E319`
   * vì lý do tương tự: huỷ phiếu để huỷ DO. */
  async deleteInventoryIssue(issueId: string): Promise<void> {
    const draftIssue = await this.ensureIssueDraft(issueId);
    if (draftIssue.outboundOrderId) {
      throw new AppException(ErrorCode.E319, HttpStatus.CONFLICT);
    }

    const [generatingRequisition] = await this.db
      .select({ id: inventoryRequisitions.id })
      .from(inventoryRequisitions)
      .where(eq(inventoryRequisitions.inventoryIssueId, issueId))
      .limit(1);
    if (generatingRequisition) {
      throw new AppException(ErrorCode.E235, HttpStatus.CONFLICT);
    }

    await this.db
      .delete(inventoryIssues)
      .where(eq(inventoryIssues.id, issueId));
  }

  /** `DRAFT → POSTED` — ghi sổ qua `InventoryPostingService`, sau đó phiếu bất biến.
   *
   * Rules:
   * - `issueType = PRODUCTION` bị chặn (`E203`) khi vật tư còn IQC chưa xử lý xong.
   * - Phiếu do phiếu lãnh sinh ra (`inventoryRequisitions.inventoryIssueId`) thì phiếu lãnh đó
   *   chuyển sang `ISSUED` cùng transaction.
   * - Phiếu sinh từ DO (`outboundOrderId`) thì DO phải đang `PENDING_DELIVERY` (`E237`), chuyển
   *   `DELIVERED` cùng transaction và đóng đơn hàng đã giao đủ.
   *
   * See `docs/CODEMAPS/inventory.md`. */
  async postInventoryIssue(
    issueId: string,
    reqDto: PostInventoryIssueReqDto,
    userId: string,
  ): Promise<void> {
    // Kiểm file tồn tại và đánh dấu đã dùng trước transaction, cùng khuôn `postSupplierReturn`.
    if (reqDto.fileIds?.length) {
      await this.filesService.linkFiles(reqDto.fileIds);
    }

    await this.db.transaction(async (tx) => {
      const lockedOutboundOrder = await this.lockOutboundOrderOfIssue(
        tx,
        issueId,
      );
      const inventoryIssue = await this.getInventoryIssueForUpdate(tx, issueId);

      if (inventoryIssue.status !== InventoryDocumentStatus.DRAFT) {
        throw new AppException(ErrorCode.E098, HttpStatus.CONFLICT);
      }

      if (
        lockedOutboundOrder &&
        lockedOutboundOrder.status !== OutboundOrderStatus.PENDING_DELIVERY
      ) {
        throw new AppException(ErrorCode.E237, HttpStatus.CONFLICT);
      }

      const itemsToPost = await tx.query.inventoryIssueItems.findMany({
        where: eq(inventoryIssueItems.issueId, issueId),
      });

      if (inventoryIssue.issueType === InventoryIssueType.PRODUCTION) {
        const hasPendingIqc = await hasPendingIqcForItems(tx, {
          itemIds: itemsToPost.map((item) => item.itemId),
        });
        if (hasPendingIqc) {
          throw new AppException(ErrorCode.E203, HttpStatus.CONFLICT);
        }
      }

      // Phiếu sinh từ DO được tạo lúc duyệt, kho có thể ghi sổ nhiều ngày sau: bút toán phải mang
      // ngày xuất thật, không phải ngày duyệt.
      const issueDate = lockedOutboundOrder
        ? new Date()
        : inventoryIssue.issueDate;

      await this.inventoryPostingService.postDocument(tx, {
        referenceType: InventoryReferenceType.INVENTORY_ISSUE,
        referenceId: issueId,
        transactionDate: issueDate,
        createdBy: userId,
        lines: itemsToPost.map((item) => ({
          itemId: item.itemId,
          signedQuantity: -item.quantity,
          type: issueTypeTransactionType[inventoryIssue.issueType],
          orderItemId: item.orderItemId,
        })),
      });

      await tx
        .update(inventoryIssues)
        .set({
          status: InventoryDocumentStatus.POSTED,
          issueDate,
          postedBy: userId,
          postedAt: new Date(),
          postNote: reqDto.note ?? null,
        })
        .where(eq(inventoryIssues.id, issueId));

      if (reqDto.fileIds?.length) {
        await tx
          .insert(inventoryIssueFiles)
          .values(
            [...new Set(reqDto.fileIds)].map((fileId) => ({ issueId, fileId })),
          );
      }

      await tx
        .update(inventoryRequisitions)
        .set({
          status: InventoryRequisitionStatus.ISSUED,
          issuedBy: userId,
          issuedAt: new Date(),
        })
        .where(eq(inventoryRequisitions.inventoryIssueId, issueId));

      if (lockedOutboundOrder) {
        await tx
          .update(outboundOrders)
          .set({ status: OutboundOrderStatus.DELIVERED })
          .where(eq(outboundOrders.id, lockedOutboundOrder.id));

        await closeOrdersIfFullyDelivered(
          tx,
          itemsToPost.flatMap((item) =>
            item.orderItemId ? [item.orderItemId] : [],
          ),
        );
      }
    });
  }

  /** `DRAFT → CANCELLED`. `POSTED` bất biến, không có đường đảo bút toán như `inventory-adjustments`
   * (`docs/CODEMAPS/inventory.md`). Phiếu do phiếu lãnh sinh ra thì huỷ luôn phiếu lãnh đó — ngược
   * chiều với `InventoryRequisitionsService.cancelInventoryRequisition`. Phiếu sinh từ DO huỷ luôn
   * DO đó (giải phóng giữ chỗ), nên người huỷ cũng phải có quyền sửa DO (`canCancelOutboundOrder`,
   * `E033`). See `docs/CODEMAPS/sales.md`. */
  async cancelInventoryIssue(
    issueId: string,
    canCancelOutboundOrder: boolean,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const lockedOutboundOrder = await this.lockOutboundOrderOfIssue(
        tx,
        issueId,
      );
      const inventoryIssue = await this.getInventoryIssueForUpdate(tx, issueId);

      if (inventoryIssue.status !== InventoryDocumentStatus.DRAFT) {
        throw new AppException(ErrorCode.E098, HttpStatus.CONFLICT);
      }

      if (lockedOutboundOrder && !canCancelOutboundOrder) {
        throw new AppException(ErrorCode.E033, HttpStatus.FORBIDDEN);
      }

      if (
        lockedOutboundOrder &&
        lockedOutboundOrder.status !== OutboundOrderStatus.PENDING_DELIVERY
      ) {
        throw new AppException(ErrorCode.E237, HttpStatus.CONFLICT);
      }

      await tx
        .update(inventoryIssues)
        .set({ status: InventoryDocumentStatus.CANCELLED })
        .where(eq(inventoryIssues.id, issueId));

      await tx
        .update(inventoryRequisitions)
        .set({ status: InventoryRequisitionStatus.CANCELLED })
        .where(eq(inventoryRequisitions.inventoryIssueId, issueId));

      if (lockedOutboundOrder) {
        await tx
          .update(outboundOrders)
          .set({ status: OutboundOrderStatus.CANCELLED })
          .where(eq(outboundOrders.id, lockedOutboundOrder.id));
      }
    });
  }

  private async createIssueItems(
    tx: DbTransaction,
    issueId: string,
    items: InventoryIssueItemReqDto[],
    baseUnitByItemId: Map<string, string>,
  ): Promise<void> {
    await tx.insert(inventoryIssueItems).values(
      items.map((item) => ({
        ...item,
        issueId,
        unitId: item.unitId ?? baseUnitByItemId.get(item.itemId)!,
      })),
    );
  }

  private async replaceIssueItems(
    tx: DbTransaction,
    issueId: string,
    items: InventoryIssueItemReqDto[],
    baseUnitByItemId: Map<string, string>,
  ): Promise<void> {
    await tx
      .delete(inventoryIssueItems)
      .where(eq(inventoryIssueItems.issueId, issueId));

    await this.createIssueItems(tx, issueId, items, baseUnitByItemId);
  }

  private async generateIssueCode(
    tx: DbTransaction,
    issueDate: Date,
  ): Promise<string> {
    const year = vnZone(issueDate).getFullYear();
    const sequence = await generateDocumentSequence(
      tx,
      DocumentType.INVENTORY_ISSUE,
      year,
    );

    return `PXK-${year}-${String(sequence).padStart(5, '0')}`;
  }

  /** Mặt hàng của mỗi dòng phải tồn tại (`E100`), và `orderItemId` (nếu có) chỉ hợp lệ trên dòng
   * item FG + phải khớp đúng `itemId` của dòng đơn hàng đó (`E107`). Không kiểm loại kho ↔ loại
   * hàng — cố ý. Trả về `itemId → unitId gốc` để mặc định `unitId` hiển thị khi payload không gửi,
   * tránh round-trip kiểm tồn tại item lần hai. */
  private async ensureItemsValid(
    itemsToValidate: InventoryIssueItemReqDto[],
  ): Promise<Map<string, string>> {
    const itemIds = [...new Set(itemsToValidate.map((item) => item.itemId))];
    const orderItemIds = [
      ...new Set(
        itemsToValidate
          .map((item) => item.orderItemId)
          .filter((id): id is string => !!id),
      ),
    ];

    const [foundItems, foundOrderItems] = await Promise.all([
      this.db.query.items.findMany({
        columns: { id: true, type: true, unitId: true },
        where: and(inArray(items.id, itemIds), isNull(items.deletedAt)),
      }),
      orderItemIds.length
        ? this.db.query.orderItems.findMany({
            columns: { id: true, itemId: true },
            where: inArray(orderItems.id, orderItemIds),
          })
        : Promise.resolve<Array<{ id: string; itemId: string }>>([]),
    ]);

    const itemById = new Map(foundItems.map((item) => [item.id, item]));
    const orderItemById = new Map(foundOrderItems.map((oi) => [oi.id, oi]));

    for (const item of itemsToValidate) {
      const found = itemById.get(item.itemId);
      if (!found) {
        throw new AppException(ErrorCode.E100, HttpStatus.NOT_FOUND);
      }
      if (item.orderItemId) {
        if (found.type !== ItemType.FG) {
          throw new AppException(ErrorCode.E107, HttpStatus.BAD_REQUEST);
        }
        const orderItem = orderItemById.get(item.orderItemId);
        if (!orderItem || orderItem.itemId !== item.itemId) {
          throw new AppException(ErrorCode.E107, HttpStatus.BAD_REQUEST);
        }
      }
    }

    return new Map(foundItems.map((item) => [item.id, item.unitId]));
  }

  private async ensureReferencesValid(reqDto: {
    productionOrderId?: string;
    productionJobId?: string;
    departmentId?: string;
    requestedBy?: string;
  }): Promise<void> {
    const [productionOrder, productionJob, department, requester] =
      await Promise.all([
        reqDto.productionOrderId
          ? this.db.query.productionOrders.findFirst({
              columns: { id: true },
              where: eq(productionOrders.id, reqDto.productionOrderId),
            })
          : Promise.resolve(true),
        reqDto.productionJobId
          ? this.db.query.productionJobs.findFirst({
              columns: { id: true },
              where: eq(productionJobs.id, reqDto.productionJobId),
            })
          : Promise.resolve(true),
        reqDto.departmentId
          ? this.db.query.departments.findFirst({
              columns: { id: true },
              where: eq(departments.id, reqDto.departmentId),
            })
          : Promise.resolve(true),
        reqDto.requestedBy
          ? this.db.query.users.findFirst({
              columns: { id: true },
              where: and(
                eq(users.id, reqDto.requestedBy),
                isNull(users.deletedAt),
              ),
            })
          : Promise.resolve(true),
      ]);

    if (!productionOrder || !productionJob || !department || !requester) {
      throw new AppException(ErrorCode.E107, HttpStatus.BAD_REQUEST);
    }
  }

  /** Khoá dòng phiếu (`FOR UPDATE`) rồi trả về — chỉ gọi bên trong transaction, bằng chính `tx`,
   * vì khoá nhả ngay khi transaction kết thúc. Nhờ đó hai lệnh `post`/`cancel` gọi trùng lên cùng
   * phiếu không cùng lọt qua kiểm trạng thái và trừ tồn hai lần. */
  private async getInventoryIssueForUpdate(tx: DbTransaction, issueId: string) {
    const [inventoryIssue] = await tx
      .select()
      .from(inventoryIssues)
      .where(eq(inventoryIssues.id, issueId))
      .for('update');

    if (!inventoryIssue) {
      throw new AppException(ErrorCode.E096, HttpStatus.NOT_FOUND);
    }

    return inventoryIssue;
  }

  /** Khoá DO của phiếu (nếu có) trước khi khoá phiếu, cùng thứ tự với `cancelOutboundOrder` (khoá
   * DO rồi mới sửa phiếu) để hai đường huỷ/ghi sổ đồng thời không khoá chéo nhau. */
  private async lockOutboundOrderOfIssue(tx: DbTransaction, issueId: string) {
    const [linkedIssue] = await tx
      .select({ outboundOrderId: inventoryIssues.outboundOrderId })
      .from(inventoryIssues)
      .where(eq(inventoryIssues.id, issueId));

    if (!linkedIssue?.outboundOrderId) return null;

    const [outboundOrder] = await tx
      .select({ id: outboundOrders.id, status: outboundOrders.status })
      .from(outboundOrders)
      .where(eq(outboundOrders.id, linkedIssue.outboundOrderId))
      .for('update');

    return outboundOrder ?? null;
  }

  private async ensureIssueExists(issueId: string) {
    const existing = await this.db.query.inventoryIssues.findFirst({
      where: eq(inventoryIssues.id, issueId),
    });

    if (!existing) {
      throw new AppException(ErrorCode.E096, HttpStatus.NOT_FOUND);
    }

    return existing;
  }

  /** `issueType = PRODUCTION` chỉ được sinh khi duyệt phiếu lãnh
   * (`POST /inventory-requisitions/:requisitionId/approve`); lập/sửa tay ở đây bị chặn (`E234`).
   * See `docs/CODEMAPS/inventory.md`, mục "State flows" (Requisition). */
  private ensureNotDirectProductionIssue(
    issueType: InventoryIssueType | undefined,
  ): void {
    if (issueType === InventoryIssueType.PRODUCTION) {
      throw new AppException(ErrorCode.E234, HttpStatus.BAD_REQUEST);
    }
  }

  private async ensureIssueDraft(issueId: string) {
    const inventoryIssue = await this.ensureIssueExists(issueId);

    if (inventoryIssue.status !== InventoryDocumentStatus.DRAFT) {
      throw new AppException(ErrorCode.E098, HttpStatus.CONFLICT);
    }

    return inventoryIssue;
  }
}
