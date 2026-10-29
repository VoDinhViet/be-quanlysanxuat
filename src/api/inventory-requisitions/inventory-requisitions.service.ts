import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import {
  and,
  desc,
  count,
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
import { vnZone } from '../../common/utils/time';
import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import type { Database, DbTransaction } from '../../database/database.type';
import {
  InventoryDocumentStatus,
  InventoryIssueType,
  InventoryRequisitionSelect,
  InventoryRequisitionStatus,
  InventoryRequisitionType,
  inventoryBalances,
  inventoryIssueItems,
  inventoryIssues,
  inventoryRequisitionItems,
  inventoryRequisitions,
  items,
  ItemType,
  orders,
  productionJobIssues,
  productionJobs,
  ProductionJobStatus,
  productionOrders,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { getInventoryBalancesForUpdate } from '../inventory/item-stock.query';
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
 * Phiếu lãnh vật tư — chứng từ duy nhất đưa DIRECT ra khỏi kho cho sản xuất. Phần đọc (tab chi tiết
 * + popup chọn vật tư) nằm ở `InventoryRequisitionLinesService`.
 *
 * See `docs/CODEMAPS/inventory.md`, mục "State flows" (Requisition).
 */
@Injectable()
export class InventoryRequisitionsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly requisitionLinesService: InventoryRequisitionLinesService,
  ) {}

  async getInventoryRequisitions(
    reqDto: GetInventoryRequisitionsReqDto,
  ): Promise<OffsetPaginatedDto<PageInventoryRequisitionResDto>> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;

    const where = and(
      keyword
        ? or(
            unaccentILike(inventoryRequisitions.code, keyword),
            unaccentILike(inventoryRequisitions.reason, keyword),
            inArray(
              inventoryRequisitions.productionOrderId,
              this.db
                .select({ id: productionOrders.id })
                .from(productionOrders)
                .innerJoin(orders, eq(orders.id, productionOrders.orderId))
                .where(unaccentILike(orders.code, keyword)),
            ),
            inArray(
              inventoryRequisitions.productionJobId,
              this.db
                .select({ id: productionJobs.id })
                .from(productionJobs)
                .where(unaccentILike(productionJobs.code, keyword)),
            ),
          )
        : undefined,
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

    const [entities, [{ total }]] = await Promise.all([
      this.db.query.inventoryRequisitions.findMany({
        where,
        limit: reqDto.limit,
        offset: reqDto.offset,
        orderBy: desc(inventoryRequisitions.createdAt),
        with: {
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
      new OffsetPaginationDto(total, reqDto),
    );
  }

  async getInventoryRequisition(
    requisitionId: string,
  ): Promise<InventoryRequisitionResDto> {
    const inventoryRequisition =
      await this.db.query.inventoryRequisitions.findFirst({
        where: eq(inventoryRequisitions.id, requisitionId),
        with: {
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
    const productionJobId =
      reqDto.type === InventoryRequisitionType.PRODUCTION
        ? (reqDto.productionJobId ?? null)
        : null;

    const baseUnitByItemId = await this.validateRequisitionLines(this.db, {
      type: reqDto.type,
      productionJobId,
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
        .values({
          ...requisitionFields,
          productionJobId,
          code,
          createdBy: userId,
        })
        .returning({ id: inventoryRequisitions.id });

      await this.createRequisitionItems(
        tx,
        inventoryRequisition.id,
        itemsToCreate,
        baseUnitByItemId,
      );
    });
  }

  /** Reopen `REJECTED → DRAFT` là một write nên validate + reopen + update chạy trong cùng một
   * transaction (khác `create`, validate ở ngoài): nếu validate fail sau khi đã reopen, phiếu sẽ
   * kẹt ở `DRAFT` dù update không thành công. */
  async updateInventoryRequisition(
    requisitionId: string,
    reqDto: UpdateInventoryRequisitionReqDto,
  ): Promise<void> {
    const { items: itemsToReplace, ...requisitionFields } = reqDto;

    await this.db.transaction(async (tx) => {
      const existing = await this.ensureRequisitionEditable(tx, requisitionId);

      const type = reqDto.type ?? existing.type;
      const productionJobId =
        type === InventoryRequisitionType.PRODUCTION
          ? (reqDto.productionJobId ?? existing.productionJobId)
          : null;
      this.ensureRequisitionTypeValid(type, productionJobId);

      const baseUnitByItemId = await this.validateRequisitionLines(tx, {
        type,
        productionJobId,
        itemsToValidate: itemsToReplace,
      });

      await tx
        .update(inventoryRequisitions)
        .set({ ...requisitionFields, productionJobId })
        .where(eq(inventoryRequisitions.id, requisitionId));

      await this.replaceRequisitionItems(
        tx,
        requisitionId,
        itemsToReplace,
        baseUnitByItemId,
      );
    });
  }

  /** Chỉ xoá được phiếu `DRAFT` — phiếu `REJECTED` đã từng qua duyệt nên đi đường `cancel`. */
  async deleteInventoryRequisition(requisitionId: string): Promise<void> {
    const [inventoryRequisition] = await this.db
      .select({ status: inventoryRequisitions.status })
      .from(inventoryRequisitions)
      .where(eq(inventoryRequisitions.id, requisitionId))
      .limit(1);

    if (!inventoryRequisition) {
      throw new AppException(ErrorCode.E223, HttpStatus.NOT_FOUND);
    }

    if (inventoryRequisition.status !== InventoryRequisitionStatus.DRAFT) {
      throw new AppException(ErrorCode.E224, HttpStatus.CONFLICT);
    }

    await this.db
      .delete(inventoryRequisitions)
      .where(eq(inventoryRequisitions.id, requisitionId));
  }

  /** `DRAFT`/`REJECTED → PENDING_APPROVAL`; phiếu `REJECTED` gửi lại được thẳng, không bắt sửa
   * dòng trước. */
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

  /** `PENDING_APPROVAL → APPROVED`, đồng thời sinh PXK `DRAFT` (`createIssueForRequisition`).
   *
   * Rules:
   * - Đây là mốc giữ chỗ thật (`HOLDING_STATUS` chỉ tính `APPROVED`), nên `validateRequisitionLines`
   *   ở đây là chốt `E231`/`E232` chính thức.
   * - Khoá `inventory_balances` của các vật tư trước khi validate (`getInventoryBalancesForUpdate`
   *   sort theo `itemId` để khỏi deadlock): thiếu thì hai phiếu duyệt đồng thời cùng vật tư đọc
   *   cùng một "Đã giữ" và cùng qua `E231`.
   * - Duyệt không ghi `inventory_balances`/`inventory_transactions`; tồn chỉ bị trừ khi kho `post`
   *   PXK (`InventoryIssuesService.postInventoryIssue`). */
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
        columns: { itemId: true, quantity: true, unitId: true, note: true },
        where: eq(inventoryRequisitionItems.requisitionId, requisitionId),
      });

      if (!itemsToApprove.length) {
        throw new AppException(ErrorCode.E227, HttpStatus.BAD_REQUEST);
      }

      await getInventoryBalancesForUpdate(
        tx,
        itemsToApprove.map((item) => item.itemId),
      );

      await this.validateRequisitionLines(tx, {
        type: inventoryRequisition.type,
        productionJobId: inventoryRequisition.productionJobId,
        itemsToValidate: itemsToApprove,
      });

      const issueId = await this.createIssueForRequisition(
        tx,
        inventoryRequisition,
        itemsToApprove,
        userId,
      );

      await tx
        .update(inventoryRequisitions)
        .set({
          status: InventoryRequisitionStatus.APPROVED,
          approvedBy: userId,
          approvedAt: new Date(),
          inventoryIssueId: issueId,
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

  /** Sinh `inventory_issues` `DRAFT` (`issueType = PRODUCTION`) + copy dòng, trong transaction của
   * `approve`. Gate IQC `E203` áp lúc kho `post` phiếu này, không phải lúc duyệt. */
  private async createIssueForRequisition(
    tx: DbTransaction,
    inventoryRequisition: InventoryRequisitionSelect,
    itemsToIssue: {
      itemId: string;
      quantity: number;
      unitId: string;
      note: string | null;
    }[],
    userId: string,
  ): Promise<string> {
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
        issueType: InventoryIssueType.PRODUCTION,
        status: InventoryDocumentStatus.DRAFT,
        issueDate: inventoryRequisition.requisitionDate,
        productionOrderId: inventoryRequisition.productionOrderId,
        productionJobId: inventoryRequisition.productionJobId,
        departmentId: inventoryRequisition.departmentId,
        requestedBy: inventoryRequisition.createdBy,
        createdBy: userId,
      })
      .returning({ id: inventoryIssues.id });

    await tx.insert(inventoryIssueItems).values(
      itemsToIssue.map((item) => ({
        issueId: issue.id,
        itemId: item.itemId,
        unitId: item.unitId,
        quantity: item.quantity,
        note: item.note,
      })),
    );

    return issue.id;
  }

  /** `DRAFT`/`PENDING_APPROVAL`/`APPROVED`/`REJECTED → CANCELLED`. Từ `APPROVED` phiếu luôn có PXK
   * `DRAFT` (`inventoryIssueId`, sinh lúc `approve`); PXK đó phải huỷ theo, nếu không vẫn `post` được
   * và trừ tồn cho một phiếu lãnh đã huỷ. */
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

      if (inventoryRequisition.inventoryIssueId) {
        await tx
          .update(inventoryIssues)
          .set({ status: InventoryDocumentStatus.CANCELLED })
          .where(eq(inventoryIssues.id, inventoryRequisition.inventoryIssueId));
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
    baseUnitByItemId: Map<string, string>,
  ): Promise<void> {
    await tx.insert(inventoryRequisitionItems).values(
      itemsToCreate.map((item, index) => ({
        ...item,
        requisitionId,
        sortOrder: index,
        unitId: item.unitId ?? baseUnitByItemId.get(item.itemId)!,
      })),
    );
  }

  private async replaceRequisitionItems(
    tx: DbTransaction,
    requisitionId: string,
    itemsToReplace: CreateInventoryRequisitionItemReqDto[],
    baseUnitByItemId: Map<string, string>,
  ): Promise<void> {
    await tx
      .delete(inventoryRequisitionItems)
      .where(eq(inventoryRequisitionItems.requisitionId, requisitionId));

    await this.createRequisitionItems(
      tx,
      requisitionId,
      itemsToReplace,
      baseUnitByItemId,
    );
  }

  private ensureRequisitionTypeValid(
    type: InventoryRequisitionType,
    productionJobId: string | null | undefined,
  ): void {
    if (type === InventoryRequisitionType.PRODUCTION && !productionJobId) {
      throw new AppException(ErrorCode.E233, HttpStatus.BAD_REQUEST);
    }
  }

  /** Validate dòng phiếu, dùng ở `create`/`update` và `approve`. Trả về `itemId → unitId gốc` để
   * `create`/`update` mặc định `unitId` khi payload không gửi.
   *
   * Rules:
   * - `create`/`update` chỉ là cảnh báo sớm: chưa khoá tồn và chỉ thấy "Đã giữ" của phiếu `APPROVED`,
   *   nên nhiều phiếu nháp vẫn có thể cùng vượt tồn. `approve` (sau `FOR UPDATE`) mới là chốt thật.
   * - Thứ tự kiểm: không trùng `itemId` (`E228`) -> item tồn tại và là DIRECT (`E229`) -> với
   *   `type = PRODUCTION`, item nằm trong BOM của Job (`E230`) -> `SL lãnh <= Có thể lãnh` (`E231`)
   *   -> có Job thì `SL lãnh <= SL BOM còn lại` (`E232`). */
  private async validateRequisitionLines(
    db: Database | DbTransaction,
    params: {
      type: InventoryRequisitionType;
      productionJobId: string | null;
      itemsToValidate: { itemId: string; quantity: number }[];
    },
  ): Promise<Map<string, string>> {
    const itemIds = params.itemsToValidate.map((item) => item.itemId);

    if (new Set(itemIds).size !== itemIds.length) {
      throw new AppException(ErrorCode.E228, HttpStatus.CONFLICT);
    }

    const foundItems = await db.query.items.findMany({
      columns: { id: true, type: true, unitId: true },
      where: and(inArray(items.id, itemIds), isNull(items.deletedAt)),
    });

    if (foundItems.length !== itemIds.length) {
      throw new AppException(ErrorCode.E007, HttpStatus.NOT_FOUND);
    }

    if (foundItems.some((item) => item.type !== ItemType.DIRECT)) {
      throw new AppException(ErrorCode.E229, HttpStatus.BAD_REQUEST);
    }

    const productionJobId =
      params.type === InventoryRequisitionType.PRODUCTION
        ? params.productionJobId
        : null;

    const jobDemandByItemId = new Map<string, number>();
    if (productionJobId) {
      // Job `PENDING` đã có snapshot vật tư nhưng chưa "Xác nhận kế hoạch" — chưa được lãnh.
      const job = await db.query.productionJobs.findFirst({
        columns: { status: true },
        where: eq(productionJobs.id, productionJobId),
      });
      if (job?.status === ProductionJobStatus.PENDING) {
        throw new AppException(ErrorCode.E087, HttpStatus.CONFLICT);
      }

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
        where: inArray(inventoryBalances.itemId, itemIds),
      }),
      getReservedQuantities(db, { itemIds }),
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

    return new Map(foundItems.map((item) => [item.id, item.unitId]));
  }

  /** Sinh mã `MR` (phiếu lãnh) và `PXK` (phiếu xuất sinh lúc `approve`). `PXK` phải giữ đúng khuôn
   * `InventoryIssuesService.generateIssueCode` vì hai nơi cùng dùng
   * `DocumentType.INVENTORY_ISSUE`. */
  private async generateDocumentCode(
    tx: DbTransaction,
    documentType: DocumentType,
    prefix: string,
    documentDate: Date,
  ): Promise<string> {
    const year = vnZone(documentDate).getFullYear();
    const sequence = await generateDocumentSequence(tx, documentType, year);

    return `${prefix}-${year}-${String(sequence).padStart(5, '0')}`;
  }

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

  /** Sửa hợp lệ khi `DRAFT`/`REJECTED` (`E224`); `REJECTED` được đưa về `DRAFT` luôn. Bắt buộc nhận
   * `tx` vì reopen là một write, phải cùng transaction với phần update (xem
   * `updateInventoryRequisition`). */
  private async ensureRequisitionEditable(
    tx: DbTransaction,
    requisitionId: string,
  ) {
    const inventoryRequisition = await tx.query.inventoryRequisitions.findFirst(
      {
        columns: {
          status: true,
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

  /** Bản chỉ đọc của `ensureRequisitionEditable` cho `send`: cùng cửa `DRAFT`/`REJECTED` nhưng không
   * reopen. */
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
