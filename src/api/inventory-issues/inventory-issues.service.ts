import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { and, count, desc, eq, gte, inArray, isNull, lt } from 'drizzle-orm';

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
  departments,
  InventoryDocumentStatus,
  InventoryIssueType,
  inventoryIssueItems,
  inventoryIssues,
  InventoryReferenceType,
  inventoryRequisitions,
  InventoryTransactionType,
  items,
  ItemType,
  orderItems,
  productionJobs,
  productionOrders,
  users,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { hasPendingIqcForItems } from '../iqc/iqc.query';
import { InventoryPostingService } from '../inventory/inventory-posting.service';
import { CreateInventoryIssueReqDto } from './dto/create-inventory-issue.req.dto';
import { GetInventoryIssuesReqDto } from './dto/get-inventory-issues.req.dto';
import { InventoryIssueItemReqDto } from './dto/inventory-issue-item.req.dto';
import { InventoryIssueResDto } from './dto/inventory-issue.res.dto';
import { PageInventoryIssueResDto } from './dto/page-inventory-issue.res.dto';
import { UpdateInventoryIssueReqDto } from './dto/update-inventory-issue.req.dto';

/** Loại phiếu → loại bút toán lúc `post` — bảng đầy đủ ở `docs/domains/inventory.md`. */
const issueTypeTransactionType: Record<
  InventoryIssueType,
  InventoryTransactionType
> = {
  [InventoryIssueType.SALES]: InventoryTransactionType.ISSUE,
  [InventoryIssueType.RETURN]: InventoryTransactionType.ISSUE,
  [InventoryIssueType.PRODUCTION]: InventoryTransactionType.PRODUCTION_OUT,
  [InventoryIssueType.ADJUSTMENT]: InventoryTransactionType.ADJUSTMENT_OUT,
};

@Injectable()
export class InventoryIssuesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly inventoryPostingService: InventoryPostingService,
  ) {}

  async getInventoryIssues(
    reqDto: GetInventoryIssuesReqDto,
  ): Promise<OffsetPaginatedDto<PageInventoryIssueResDto>> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;
    const where = and(
      keyword ? unaccentILike(inventoryIssues.code, keyword) : undefined,
      reqDto.warehouseId
        ? eq(inventoryIssues.warehouseId, reqDto.warehouseId)
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

    const [entities, countRows] = await Promise.all([
      this.db.query.inventoryIssues.findMany({
        where,
        limit: reqDto.limit,
        offset: reqDto.offset,
        orderBy: [
          desc(inventoryIssues.issueDate),
          desc(inventoryIssues.createdAt),
        ],
        with: {
          warehouse: true,
          productionOrder: true,
          productionJob: true,
          department: true,
          requesterBy: true,
          posterBy: true,
          creatorBy: true,
          items: { with: { item: true } },
        },
      }),
      this.db.select({ total: count() }).from(inventoryIssues).where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(PageInventoryIssueResDto, entities, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(countRows[0]?.total ?? 0, reqDto),
    );
  }

  async getInventoryIssue(issueId: string): Promise<InventoryIssueResDto> {
    const inventoryIssue = await this.db.query.inventoryIssues.findFirst({
      where: eq(inventoryIssues.id, issueId),
      with: {
        warehouse: true,
        productionOrder: true,
        productionJob: true,
        department: true,
        requesterBy: true,
        posterBy: true,
        creatorBy: true,
        items: { with: { item: true } },
      },
    });

    if (!inventoryIssue) {
      throw new AppException(ErrorCode.E096, HttpStatus.NOT_FOUND);
    }

    return plainToInstance(InventoryIssueResDto, inventoryIssue, {
      excludeExtraneousValues: true,
    });
  }

  async createInventoryIssue(
    reqDto: CreateInventoryIssueReqDto,
    userId: string,
  ): Promise<void> {
    this.ensureNotDirectProductionIssue(reqDto.issueType);
    await this.ensureItemsValid(reqDto.items);
    await this.ensureReferencesValid(reqDto);

    const { items: itemsToCreate, ...issueFields } = reqDto;

    await this.db.transaction(async (tx) => {
      const code = await this.generateIssueCode(tx, reqDto.issueDate);

      const [inventoryIssue] = await tx
        .insert(inventoryIssues)
        .values({ ...issueFields, code, createdBy: userId })
        .returning();

      await this.createIssueItems(tx, inventoryIssue.id, itemsToCreate);
    });
  }

  async updateInventoryIssue(
    issueId: string,
    reqDto: UpdateInventoryIssueReqDto,
  ): Promise<void> {
    await this.ensureIssueDraft(issueId);

    this.ensureNotDirectProductionIssue(reqDto.issueType);
    await this.ensureItemsValid(reqDto.items);
    await this.ensureReferencesValid(reqDto);

    const { items: itemsToReplace, ...issueFields } = reqDto;

    await this.db.transaction(async (tx) => {
      await tx
        .update(inventoryIssues)
        .set(issueFields)
        .where(eq(inventoryIssues.id, issueId));

      await this.replaceIssueItems(tx, issueId, itemsToReplace);
    });
  }

  async deleteInventoryIssue(issueId: string): Promise<void> {
    await this.ensureIssueDraft(issueId);

    await this.db
      .delete(inventoryIssues)
      .where(eq(inventoryIssues.id, issueId));
  }

  /** `DRAFT → POSTED` — sinh bút toán + cập nhật tồn qua `InventoryPostingService`, sau đó phiếu
   * bất biến. Đọc trạng thái nằm trong cùng transaction, sau `getInventoryIssueForUpdate`.
   * `issueType = PRODUCTION`
   * kèm gate IQC (`E203`, `docs/decisions/qc-gates-on-stock-moves.md`) — vật tư chưa qua IQC (hoặc
   * còn FAIL chưa xử lý) không được xuất cho sản xuất. Xem `docs/workflows/stock-movement.md`. */
  async postInventoryIssue(issueId: string, userId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const inventoryIssue = await this.getInventoryIssueForUpdate(tx, issueId);

      if (inventoryIssue.status !== InventoryDocumentStatus.DRAFT) {
        throw new AppException(ErrorCode.E098, HttpStatus.CONFLICT);
      }

      const itemsToPost = await tx.query.inventoryIssueItems.findMany({
        where: eq(inventoryIssueItems.issueId, issueId),
      });

      if (inventoryIssue.issueType === InventoryIssueType.PRODUCTION) {
        const hasPendingIqc = await hasPendingIqcForItems(tx, {
          itemIds: itemsToPost.map((item) => item.itemId),
          warehouseId: inventoryIssue.warehouseId,
        });
        if (hasPendingIqc) {
          throw new AppException(ErrorCode.E203, HttpStatus.CONFLICT);
        }
      }

      await this.inventoryPostingService.postDocument(tx, {
        warehouseId: inventoryIssue.warehouseId,
        referenceType: InventoryReferenceType.INVENTORY_ISSUE,
        referenceId: issueId,
        transactionDate: inventoryIssue.issueDate,
        createdBy: userId,
        lines: itemsToPost.map((item) => ({
          itemId: item.itemId,
          // Xuất luôn trừ tồn — dấu âm.
          signedQuantity: -item.quantity,
          type: issueTypeTransactionType[inventoryIssue.issueType],
          orderItemId: item.orderItemId,
        })),
      });

      await tx
        .update(inventoryIssues)
        .set({
          status: InventoryDocumentStatus.POSTED,
          postedBy: userId,
          postedAt: new Date(),
        })
        .where(eq(inventoryIssues.id, issueId));
    });
  }

  /** `DRAFT`/`POSTED → CANCELLED`. Từ `POSTED` thì đảo bút toán trước khi đổi trạng thái — xem
   * `InventoryPostingService.reverseDocument`. Chặn (`E235`) nếu phiếu do
   * `inventoryRequisitions.inventoryIssueId` trỏ tới — huỷ ở đây mà không đụng phiếu lãnh sẽ để
   * phiếu lãnh kẹt ở `ISSUED` với tồn đã hoàn. */
  async cancelInventoryIssue(issueId: string, userId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const inventoryIssue = await this.getInventoryIssueForUpdate(tx, issueId);

      if (inventoryIssue.status === InventoryDocumentStatus.CANCELLED) {
        throw new AppException(ErrorCode.E098, HttpStatus.CONFLICT);
      }

      const generatingRequisition =
        await tx.query.inventoryRequisitions.findFirst({
          columns: { id: true },
          where: eq(inventoryRequisitions.inventoryIssueId, issueId),
        });
      if (generatingRequisition) {
        throw new AppException(ErrorCode.E235, HttpStatus.CONFLICT);
      }

      if (inventoryIssue.status === InventoryDocumentStatus.POSTED) {
        await this.inventoryPostingService.reverseDocument(tx, {
          referenceType: InventoryReferenceType.INVENTORY_ISSUE,
          referenceId: issueId,
          transactionDate: new Date(),
          createdBy: userId,
        });
      }

      await tx
        .update(inventoryIssues)
        .set({ status: InventoryDocumentStatus.CANCELLED })
        .where(eq(inventoryIssues.id, issueId));
    });
  }

  private async createIssueItems(
    tx: DbTransaction,
    issueId: string,
    items: InventoryIssueItemReqDto[],
  ): Promise<void> {
    await tx
      .insert(inventoryIssueItems)
      .values(items.map((item) => ({ ...item, issueId })));
  }

  private async replaceIssueItems(
    tx: DbTransaction,
    issueId: string,
    items: InventoryIssueItemReqDto[],
  ): Promise<void> {
    await tx
      .delete(inventoryIssueItems)
      .where(eq(inventoryIssueItems.issueId, issueId));

    await this.createIssueItems(tx, issueId, items);
  }

  private async generateIssueCode(
    tx: DbTransaction,
    issueDate: Date,
  ): Promise<string> {
    const year = issueDate.getFullYear();
    const sequence = await generateDocumentSequence(
      tx,
      DocumentType.INVENTORY_ISSUE,
      year,
    );

    return `PXK-${year}-${String(sequence).padStart(5, '0')}`;
  }

  /** Mặt hàng của mỗi dòng phải tồn tại (`E100`), và `orderItemId` (nếu có) chỉ hợp lệ trên dòng
   * item FG + phải khớp đúng `itemId` của dòng đơn hàng đó (`E107`). Không kiểm loại kho ↔ loại
   * hàng — cố ý. */
  private async ensureItemsValid(
    itemsToValidate: InventoryIssueItemReqDto[],
  ): Promise<void> {
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
        columns: { id: true, type: true },
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

  private async ensureIssueExists(issueId: string) {
    const existing = await this.db.query.inventoryIssues.findFirst({
      where: eq(inventoryIssues.id, issueId),
    });

    if (!existing) {
      throw new AppException(ErrorCode.E096, HttpStatus.NOT_FOUND);
    }

    return existing;
  }

  /** `issueType = PRODUCTION` chỉ còn sinh được từ `POST /inventory-requisitions/:requisitionId/issue` —
   * lập/sửa tay ở đây bị chặn (`E234`), xem `docs/domains/inventory.md`, mục "Phiếu lãnh vật tư". */
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
