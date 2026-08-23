import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import {
  and,
  asc,
  desc,
  count,
  eq,
  gte,
  inArray,
  isNull,
  lt,
} from 'drizzle-orm';

import { OffsetPaginationDto } from '../../common/dto/offset-pagination/offset-pagination.dto';
import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import {
  DocumentType,
  generateDocumentSequence,
} from '../../common/utils/document-sequence.util';
import { unaccentILike } from '../../common/utils/search.util';
import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import type { Database, DbTransaction } from '../../database/database.type';
import {
  InventoryDocumentStatus,
  InventoryIssueType,
  InventoryReferenceType,
  InventoryRequisitionStatus,
  InventoryRequisitionType,
  InventoryTransactionType,
  inventoryBalances,
  inventoryIssueItems,
  inventoryIssues,
  inventoryRequisitionItems,
  inventoryRequisitions,
  items,
  ItemType,
  productionJobIssues,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { hasPendingIqcForItems } from '../iqc/iqc.query';
import { InventoryPostingService } from '../inventory/inventory-posting.service';
import { CreateInventoryRequisitionItemReqDto } from './dto/create-inventory-requisition-item.req.dto';
import { CreateInventoryRequisitionReqDto } from './dto/create-inventory-requisition.req.dto';
import { GetInventoryRequisitionsReqDto } from './dto/get-inventory-requisitions.req.dto';
import { InventoryRequisitionResDto } from './dto/inventory-requisition.res.dto';
import { PageInventoryRequisitionResDto } from './dto/page-inventory-requisition.res.dto';
import { RejectInventoryRequisitionReqDto } from './dto/reject-inventory-requisition.req.dto';
import { UpdateInventoryRequisitionReqDto } from './dto/update-inventory-requisition.req.dto';
import { InventoryRequisitionLinesService } from './inventory-requisition-lines.service';
import {
  getIssuedQuantities,
  getReservedQuantities,
} from './inventory-requisitions.query';

/**
 * Phiếu lãnh vật tư — chứng từ duy nhất đưa RM ra khỏi kho cho sản xuất. Đọc (tab chi tiết + 2
 * popup chọn vật tư) sống ở `InventoryRequisitionLinesService`, tách riêng vì cùng một bộ join
 * tính "6 số" lặp lại ba lần. Xem `docs/domains/inventory.md` mục "Phiếu lãnh vật tư",
 * `docs/workflows/inventory-requisition.md`.
 */
@Injectable()
export class InventoryRequisitionsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly inventoryPostingService: InventoryPostingService,
    private readonly requisitionLinesService: InventoryRequisitionLinesService,
  ) {}

  async getInventoryRequisitions(
    reqDto: GetInventoryRequisitionsReqDto,
  ): Promise<OffsetPaginatedDto<PageInventoryRequisitionResDto>> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;

    const where = and(
      keyword ? unaccentILike(inventoryRequisitions.code, keyword) : undefined,
      reqDto.type ? eq(inventoryRequisitions.type, reqDto.type) : undefined,
      reqDto.status
        ? eq(inventoryRequisitions.status, reqDto.status)
        : undefined,
      reqDto.createdBy
        ? eq(inventoryRequisitions.createdBy, reqDto.createdBy)
        : undefined,
      reqDto.productionOrderId
        ? eq(inventoryRequisitions.productionOrderId, reqDto.productionOrderId)
        : undefined,
      reqDto.productionJobId
        ? eq(inventoryRequisitions.productionJobId, reqDto.productionJobId)
        : undefined,
      reqDto.startDate
        ? gte(inventoryRequisitions.requisitionDate, reqDto.startDate)
        : undefined,
      reqDto.endDate
        ? lt(
            inventoryRequisitions.requisitionDate,
            new Date(reqDto.endDate.getTime() + 24 * 60 * 60 * 1000),
          )
        : undefined,
    );

    const [entities, countRows] = await Promise.all([
      this.db.query.inventoryRequisitions.findMany({
        where,
        limit: reqDto.limit,
        offset: reqDto.offset,
        orderBy: [
          desc(inventoryRequisitions.requisitionDate),
          desc(inventoryRequisitions.createdAt),
        ],
        with: {
          warehouse: true,
          department: true,
          productionOrder: { with: { order: true } },
          productionJob: true,
          creatorBy: true,
        },
      }),
      this.db
        .select({ total: count() })
        .from(inventoryRequisitions)
        .where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(PageInventoryRequisitionResDto, entities, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(countRows[0]?.total ?? 0, reqDto),
    );
  }

  async getInventoryRequisition(
    requisitionId: string,
  ): Promise<InventoryRequisitionResDto> {
    const inventoryRequisition =
      await this.db.query.inventoryRequisitions.findFirst({
        where: eq(inventoryRequisitions.id, requisitionId),
        with: {
          warehouse: true,
          department: true,
          productionOrder: { with: { order: true } },
          productionJob: true,
          inventoryIssue: true,
          creatorBy: true,
          senderBy: true,
          approverBy: true,
          rejecterBy: true,
          issuerBy: true,
        },
      });

    if (!inventoryRequisition) {
      throw new AppException(ErrorCode.E223, HttpStatus.NOT_FOUND);
    }

    const requisitionLines =
      await this.requisitionLinesService.getRequisitionLines(requisitionId, {
        warehouseId: inventoryRequisition.warehouseId,
        productionJobId: inventoryRequisition.productionJobId,
      });

    return plainToInstance(
      InventoryRequisitionResDto,
      { ...inventoryRequisition, items: requisitionLines },
      { excludeExtraneousValues: true },
    );
  }

  async createInventoryRequisition(
    reqDto: CreateInventoryRequisitionReqDto,
    userId: string,
  ): Promise<void> {
    this.ensureRequisitionTypeValid(reqDto.type, reqDto.productionJobId);

    const { items: itemsToCreate, ...requisitionFields } = reqDto;

    await this.validateRequisitionLines(this.db, {
      warehouseId: reqDto.warehouseId,
      type: reqDto.type,
      productionJobId: reqDto.productionJobId ?? null,
      itemsToValidate: itemsToCreate,
    });

    await this.db.transaction(async (tx) => {
      const code = await this.generateDocumentCode(
        tx,
        DocumentType.INVENTORY_REQUISITION,
        'MR',
        reqDto.requisitionDate,
      );

      const [inventoryRequisition] = await tx
        .insert(inventoryRequisitions)
        .values({ ...requisitionFields, code, createdBy: userId })
        .returning({ id: inventoryRequisitions.id });

      await this.createRequisitionItems(
        tx,
        inventoryRequisition.id,
        itemsToCreate,
      );
    });
  }

  /** Reopen (`REJECTED → DRAFT`) là một write — chạy toàn bộ validate + reopen + update trong
   * **cùng một** transaction (khác `create`, không tách pha ngoài/trong) để tránh nửa-vời: validate
   * fail sau khi đã reopen sẽ để phiếu kẹt ở `DRAFT` dù update không thành công. Cùng khuôn
   * `PurchaseRequestsService.updatePurchaseRequestItem`. */
  async updateInventoryRequisition(
    requisitionId: string,
    reqDto: UpdateInventoryRequisitionReqDto,
  ): Promise<void> {
    const { items: itemsToReplace, ...requisitionFields } = reqDto;

    await this.db.transaction(async (tx) => {
      const existing = await this.ensureRequisitionEditable(tx, requisitionId);

      const type = reqDto.type ?? existing.type;
      const productionJobId =
        reqDto.productionJobId ?? existing.productionJobId;
      this.ensureRequisitionTypeValid(type, productionJobId);

      await this.validateRequisitionLines(tx, {
        warehouseId: existing.warehouseId,
        type,
        productionJobId,
        itemsToValidate: itemsToReplace,
        excludeRequisitionId: requisitionId,
      });

      await tx
        .update(inventoryRequisitions)
        .set(requisitionFields)
        .where(eq(inventoryRequisitions.id, requisitionId));

      await this.replaceRequisitionItems(tx, requisitionId, itemsToReplace);
    });
  }

  async deleteInventoryRequisition(requisitionId: string): Promise<void> {
    await this.ensureRequisitionDraftOrRejected(requisitionId);

    await this.db
      .delete(inventoryRequisitions)
      .where(eq(inventoryRequisitions.id, requisitionId));
  }

  /** `DRAFT`/`REJECTED → PENDING_APPROVAL` — khác `purchase-requests` (chỉ nhận `DRAFT`), ở đây
   * `REJECTED` gửi lại được thẳng, không bắt sửa dòng trước. */
  async sendInventoryRequisition(
    requisitionId: string,
    userId: string,
  ): Promise<void> {
    await this.ensureRequisitionDraftOrRejected(requisitionId);

    await this.db
      .update(inventoryRequisitions)
      .set({
        status: InventoryRequisitionStatus.PENDING_APPROVAL,
        sentBy: userId,
        sentAt: new Date(),
      })
      .where(eq(inventoryRequisitions.id, requisitionId));
  }

  /** `PENDING_APPROVAL → APPROVED` — **nơi chặn thật** `E231`/`E232` (create/update chỉ chặn sớm,
   * chấp nhận TOCTOU). Chỉ đổi `status`, không đụng `inventory_balances`/`inventory_transactions` —
   * "Đã giữ" là số tính lúc đọc từ các dòng `APPROVED`, không ghi cột nào. Khoá trước các dòng
   * `inventory_balances` liên quan (`itemIds` sort tăng dần, tránh deadlock với phiếu khác đang
   * duyệt chồng vật tư) — nếu không, hai phiếu duyệt đồng thời cùng `(kho, vật tư)` có thể cùng đọc
   * "Đã giữ" y hệt nhau và cùng qua được `E231`. */
  async approveInventoryRequisition(
    requisitionId: string,
    userId: string,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const inventoryRequisition = await this.getInventoryRequisitionForUpdate(
        tx,
        requisitionId,
      );

      if (
        inventoryRequisition.status !==
        InventoryRequisitionStatus.PENDING_APPROVAL
      ) {
        throw new AppException(ErrorCode.E225, HttpStatus.CONFLICT);
      }

      const itemsToApprove = await tx.query.inventoryRequisitionItems.findMany({
        columns: { itemId: true, quantity: true },
        where: eq(inventoryRequisitionItems.requisitionId, requisitionId),
      });

      await this.getInventoryBalancesForUpdate(
        tx,
        inventoryRequisition.warehouseId,
        itemsToApprove.map((item) => item.itemId),
      );

      await this.validateRequisitionLines(tx, {
        warehouseId: inventoryRequisition.warehouseId,
        type: inventoryRequisition.type,
        productionJobId: inventoryRequisition.productionJobId,
        itemsToValidate: itemsToApprove,
        excludeRequisitionId: requisitionId,
      });

      await tx
        .update(inventoryRequisitions)
        .set({
          status: InventoryRequisitionStatus.APPROVED,
          approvedBy: userId,
          approvedAt: new Date(),
        })
        .where(eq(inventoryRequisitions.id, requisitionId));
    });
  }

  async rejectInventoryRequisition(
    requisitionId: string,
    reqDto: RejectInventoryRequisitionReqDto,
    userId: string,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const inventoryRequisition = await this.getInventoryRequisitionForUpdate(
        tx,
        requisitionId,
      );

      if (
        inventoryRequisition.status !==
        InventoryRequisitionStatus.PENDING_APPROVAL
      ) {
        throw new AppException(ErrorCode.E225, HttpStatus.CONFLICT);
      }

      await tx
        .update(inventoryRequisitions)
        .set({
          status: InventoryRequisitionStatus.REJECTED,
          rejectedBy: userId,
          rejectedAt: new Date(),
          rejectionReason: reqDto.reason,
        })
        .where(eq(inventoryRequisitions.id, requisitionId));
    });
  }

  /** `APPROVED → ISSUED` (điểm cuối) — sinh 1 `inventory_issues` (`POSTED` ngay) + trừ tồn qua
   * `InventoryPostingService`, cùng gate IQC mà `InventoryIssuesService.postInventoryIssue` áp cho
   * `issueType = PRODUCTION`. Xem `docs/workflows/inventory-requisition.md`. */
  async issueInventoryRequisition(
    requisitionId: string,
    userId: string,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const inventoryRequisition = await this.getInventoryRequisitionForUpdate(
        tx,
        requisitionId,
      );

      if (inventoryRequisition.status !== InventoryRequisitionStatus.APPROVED) {
        throw new AppException(ErrorCode.E226, HttpStatus.CONFLICT);
      }

      const itemsToIssue = await tx.query.inventoryRequisitionItems.findMany({
        where: eq(inventoryRequisitionItems.requisitionId, requisitionId),
      });

      if (!itemsToIssue.length) {
        throw new AppException(ErrorCode.E227, HttpStatus.BAD_REQUEST);
      }

      const hasPendingIqc = await hasPendingIqcForItems(tx, {
        itemIds: itemsToIssue.map((item) => item.itemId),
        warehouseId: inventoryRequisition.warehouseId,
      });
      if (hasPendingIqc) {
        throw new AppException(ErrorCode.E203, HttpStatus.CONFLICT);
      }

      const issueCode = await this.generateDocumentCode(
        tx,
        DocumentType.INVENTORY_ISSUE,
        'PXK',
        inventoryRequisition.requisitionDate,
      );

      const [issue] = await tx
        .insert(inventoryIssues)
        .values({
          code: issueCode,
          warehouseId: inventoryRequisition.warehouseId,
          issueType: InventoryIssueType.PRODUCTION,
          status: InventoryDocumentStatus.POSTED,
          issueDate: inventoryRequisition.requisitionDate,
          productionOrderId: inventoryRequisition.productionOrderId,
          productionJobId: inventoryRequisition.productionJobId,
          departmentId: inventoryRequisition.departmentId,
          requestedBy: inventoryRequisition.createdBy,
          postedBy: userId,
          postedAt: new Date(),
          createdBy: userId,
        })
        .returning({ id: inventoryIssues.id });

      await tx.insert(inventoryIssueItems).values(
        itemsToIssue.map((item) => ({
          issueId: issue.id,
          itemId: item.itemId,
          quantity: item.quantity,
          note: item.note,
        })),
      );

      await this.inventoryPostingService.postDocument(tx, {
        warehouseId: inventoryRequisition.warehouseId,
        referenceType: InventoryReferenceType.INVENTORY_ISSUE,
        referenceId: issue.id,
        transactionDate: inventoryRequisition.requisitionDate,
        createdBy: userId,
        lines: itemsToIssue.map((item) => ({
          itemId: item.itemId,
          signedQuantity: -item.quantity,
          type: InventoryTransactionType.PRODUCTION_OUT,
        })),
      });

      await tx
        .update(inventoryRequisitions)
        .set({
          status: InventoryRequisitionStatus.ISSUED,
          issuedBy: userId,
          issuedAt: new Date(),
          inventoryIssueId: issue.id,
        })
        .where(eq(inventoryRequisitions.id, requisitionId));
    });
  }

  async cancelInventoryRequisition(requisitionId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const inventoryRequisition = await this.getInventoryRequisitionForUpdate(
        tx,
        requisitionId,
      );

      if (
        inventoryRequisition.status === InventoryRequisitionStatus.ISSUED ||
        inventoryRequisition.status === InventoryRequisitionStatus.CANCELLED
      ) {
        throw new AppException(ErrorCode.E224, HttpStatus.CONFLICT);
      }

      await tx
        .update(inventoryRequisitions)
        .set({ status: InventoryRequisitionStatus.CANCELLED })
        .where(eq(inventoryRequisitions.id, requisitionId));
    });
  }

  private async createRequisitionItems(
    tx: DbTransaction,
    requisitionId: string,
    itemsToCreate: CreateInventoryRequisitionItemReqDto[],
  ): Promise<void> {
    await tx.insert(inventoryRequisitionItems).values(
      itemsToCreate.map((item, index) => ({
        ...item,
        requisitionId,
        sortOrder: index,
      })),
    );
  }

  private async replaceRequisitionItems(
    tx: DbTransaction,
    requisitionId: string,
    itemsToReplace: CreateInventoryRequisitionItemReqDto[],
  ): Promise<void> {
    await tx
      .delete(inventoryRequisitionItems)
      .where(eq(inventoryRequisitionItems.requisitionId, requisitionId));

    await this.createRequisitionItems(tx, requisitionId, itemsToReplace);
  }

  private ensureRequisitionTypeValid(
    type: InventoryRequisitionType,
    productionJobId: string | null | undefined,
  ): void {
    if (type === InventoryRequisitionType.PRODUCTION && !productionJobId) {
      throw new AppException(ErrorCode.E233, HttpStatus.BAD_REQUEST);
    }
  }

  /** Chốt chặn dùng chung cho `create`/`update` (ngoài transaction, TOCTOU chấp nhận được) và
   * `approve` (trong transaction, sau `FOR UPDATE`, đây là chốt thật). Bốn bước: không trùng
   * `itemId` (`E228`) → mọi item tồn tại + là RM (`E229`) → (`type = PRODUCTION`) mọi item nằm
   * trong định mức BOM của Job (`E230`) → từng dòng `SL lãnh ≤ Có thể lãnh` (`E231`) và, nếu có
   * Job, `SL lãnh ≤ SL BOM còn lại` (`E232`). */
  private async validateRequisitionLines(
    db: Database | DbTransaction,
    params: {
      warehouseId: string;
      type: InventoryRequisitionType;
      productionJobId: string | null;
      itemsToValidate: { itemId: string; quantity: number }[];
      excludeRequisitionId?: string;
    },
  ): Promise<void> {
    const itemIds = params.itemsToValidate.map((item) => item.itemId);

    if (new Set(itemIds).size !== itemIds.length) {
      throw new AppException(ErrorCode.E228, HttpStatus.CONFLICT);
    }

    const foundItems = await db.query.items.findMany({
      columns: { id: true, type: true },
      where: and(inArray(items.id, itemIds), isNull(items.deletedAt)),
    });

    if (foundItems.length !== itemIds.length) {
      throw new AppException(ErrorCode.E007, HttpStatus.NOT_FOUND);
    }

    if (foundItems.some((item) => item.type !== ItemType.RM)) {
      throw new AppException(ErrorCode.E229, HttpStatus.BAD_REQUEST);
    }

    const productionJobId =
      params.type === InventoryRequisitionType.PRODUCTION
        ? params.productionJobId
        : null;

    const jobDemandByItemId = new Map<string, number>();
    if (productionJobId) {
      const jobIssues = await db.query.productionJobIssues.findMany({
        columns: { itemId: true, requiredQty: true },
        where: eq(productionJobIssues.productionJobId, productionJobId),
      });

      for (const row of jobIssues) {
        if (row.itemId) {
          jobDemandByItemId.set(row.itemId, row.requiredQty);
        }
      }

      if (itemIds.some((itemId) => !jobDemandByItemId.has(itemId))) {
        throw new AppException(ErrorCode.E230, HttpStatus.BAD_REQUEST);
      }
    }

    const [onHandRows, reservedByItemId, issuedByItemId] = await Promise.all([
      db.query.inventoryBalances.findMany({
        columns: { itemId: true, quantity: true },
        where: and(
          eq(inventoryBalances.warehouseId, params.warehouseId),
          inArray(inventoryBalances.itemId, itemIds),
        ),
      }),
      getReservedQuantities(db, {
        warehouseId: params.warehouseId,
        itemIds,
        excludeRequisitionId: params.excludeRequisitionId,
      }),
      productionJobId
        ? getIssuedQuantities(db, { productionJobId, itemIds })
        : Promise.resolve(new Map<string, number>()),
    ]);

    const onHandByItemId = new Map(
      onHandRows.map((row) => [row.itemId, row.quantity]),
    );

    for (const item of params.itemsToValidate) {
      const onHand = onHandByItemId.get(item.itemId) ?? 0;
      const reservedQuantity = reservedByItemId.get(item.itemId) ?? 0;
      const issuableQuantity = onHand - reservedQuantity;

      if (item.quantity > issuableQuantity) {
        throw new AppException(ErrorCode.E231, HttpStatus.CONFLICT);
      }

      if (productionJobId) {
        const requiredQty = jobDemandByItemId.get(item.itemId) ?? 0;
        const issuedQty = issuedByItemId.get(item.itemId) ?? 0;
        const remainingQty = requiredQty - issuedQty;

        if (item.quantity > remainingQty) {
          throw new AppException(ErrorCode.E232, HttpStatus.CONFLICT);
        }
      }
    }
  }

  /** Dùng cho cả mã phiếu lãnh (`MR`) lẫn mã phiếu xuất tự sinh lúc `issue` (`PXK`) — `PXK` phải
   * giữ đúng khuôn của `InventoryIssuesService.generateIssueCode`, hai nơi cùng ăn một
   * `DocumentType.INVENTORY_ISSUE`. */
  private async generateDocumentCode(
    tx: DbTransaction,
    documentType: DocumentType,
    prefix: string,
    documentDate: Date,
  ): Promise<string> {
    const year = documentDate.getFullYear();
    const sequence = await generateDocumentSequence(tx, documentType, year);

    return `${prefix}-${year}-${String(sequence).padStart(5, '0')}`;
  }

  /** Khoá (`FOR UPDATE`) các dòng `inventory_balances` của `(warehouseId, itemIds)`, sort tăng dần
   * theo `itemId` — thứ tự khoá cố định để hai phiếu duyệt chồng vật tư không deadlock. Vật tư chưa
   * có dòng `inventory_balances` thì `FOR UPDATE` không khoá được gì — vô hại: `Tồn = 0` nên
   * `validateRequisitionLines` chặn `E231` ngay với mọi SL dương, không có gì để đọc lệch. */
  private async getInventoryBalancesForUpdate(
    tx: DbTransaction,
    warehouseId: string,
    itemIds: string[],
  ): Promise<{ itemId: string; quantity: number }[]> {
    if (!itemIds.length) {
      return [];
    }

    return tx
      .select({
        itemId: inventoryBalances.itemId,
        quantity: inventoryBalances.quantity,
      })
      .from(inventoryBalances)
      .where(
        and(
          eq(inventoryBalances.warehouseId, warehouseId),
          inArray(inventoryBalances.itemId, itemIds),
        ),
      )
      .orderBy(asc(inventoryBalances.itemId))
      .for('update');
  }

  /** Khoá phiếu (`FOR UPDATE`) rồi trả về — chỉ gọi bên trong transaction, cùng khuôn
   * `InventoryIssuesService.getInventoryIssueForUpdate`. */
  private async getInventoryRequisitionForUpdate(
    tx: DbTransaction,
    requisitionId: string,
  ) {
    const [inventoryRequisition] = await tx
      .select()
      .from(inventoryRequisitions)
      .where(eq(inventoryRequisitions.id, requisitionId))
      .for('update');

    if (!inventoryRequisition) {
      throw new AppException(ErrorCode.E223, HttpStatus.NOT_FOUND);
    }

    return inventoryRequisition;
  }

  /** Sửa hợp lệ khi `DRAFT`/`REJECTED` (`E224`) — `REJECTED` tự đưa về `DRAFT` ngay trong
   * transaction của nơi gọi (coi như sửa lại từ đầu), cùng khuôn
   * `PurchaseRequestsService.ensurePurchaseRequestEditable`. Bắt buộc nhận `tx` — reopen là một
   * write, phải cùng transaction với phần update còn lại (xem `updateInventoryRequisition`). */
  private async ensureRequisitionEditable(
    tx: DbTransaction,
    requisitionId: string,
  ) {
    const inventoryRequisition = await tx.query.inventoryRequisitions.findFirst(
      {
        columns: {
          status: true,
          warehouseId: true,
          type: true,
          productionJobId: true,
        },
        where: eq(inventoryRequisitions.id, requisitionId),
      },
    );

    if (!inventoryRequisition) {
      throw new AppException(ErrorCode.E223, HttpStatus.NOT_FOUND);
    }

    if (
      inventoryRequisition.status !== InventoryRequisitionStatus.DRAFT &&
      inventoryRequisition.status !== InventoryRequisitionStatus.REJECTED
    ) {
      throw new AppException(ErrorCode.E224, HttpStatus.CONFLICT);
    }

    if (inventoryRequisition.status === InventoryRequisitionStatus.REJECTED) {
      await tx
        .update(inventoryRequisitions)
        .set({ status: InventoryRequisitionStatus.DRAFT })
        .where(eq(inventoryRequisitions.id, requisitionId));
    }

    return inventoryRequisition;
  }

  /** Sibling read-only của `ensureRequisitionEditable`: cùng cửa `DRAFT`/`REJECTED` nhưng không mở
   * `REJECTED → DRAFT` — dùng cho `send` (đích đến `PENDING_APPROVAL`) và `delete` (phiếu bị xoá
   * ngay sau đó). */
  private async ensureRequisitionDraftOrRejected(
    requisitionId: string,
  ): Promise<void> {
    const inventoryRequisition =
      await this.db.query.inventoryRequisitions.findFirst({
        columns: { status: true },
        where: eq(inventoryRequisitions.id, requisitionId),
      });

    if (!inventoryRequisition) {
      throw new AppException(ErrorCode.E223, HttpStatus.NOT_FOUND);
    }

    if (
      inventoryRequisition.status !== InventoryRequisitionStatus.DRAFT &&
      inventoryRequisition.status !== InventoryRequisitionStatus.REJECTED
    ) {
      throw new AppException(ErrorCode.E224, HttpStatus.CONFLICT);
    }
  }
}
