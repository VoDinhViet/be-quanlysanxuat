import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { and, count, desc, eq, gte, inArray, isNull, lt } from 'drizzle-orm';

import { OffsetPaginationDto } from '../../common/dto/offset-pagination/offset-pagination.dto';
import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
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
  InventoryItemType,
  InventoryReferenceType,
  InventoryTransactionType,
  materials,
  orderItems,
  products,
  productionJobs,
  productionOrders,
  users,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { InventoryPostingService } from '../inventory/inventory-posting.service';
import { WarehousesService } from '../warehouses/warehouses.service';
import { CreateInventoryIssueReqDto } from './dto/create-inventory-issue.req.dto';
import { GetInventoryIssuesReqDto } from './dto/get-inventory-issues.req.dto';
import { InventoryIssueItemReqDto } from './dto/inventory-issue-item.req.dto';
import { InventoryIssueResDto } from './dto/inventory-issue.res.dto';
import { UpdateInventoryIssueReqDto } from './dto/update-inventory-issue.req.dto';

const ISSUE_DETAIL_WITH = {
  warehouse: true,
  productionOrder: true,
  productionJob: true,
  department: true,
  requester: true,
  poster: true,
  creator: true,
  items: { with: { product: true, material: true } },
} as const;

/** Loại phiếu → loại bút toán lúc `post` — bảng đầy đủ ở `docs/domains/inventory.md`. */
const ISSUE_TYPE_TRANSACTION_TYPE: Record<
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
    private readonly warehousesService: WarehousesService,
    private readonly inventoryPostingService: InventoryPostingService,
  ) {}

  async getInventoryIssues(
    reqDto: GetInventoryIssuesReqDto,
  ): Promise<OffsetPaginatedDto<InventoryIssueResDto>> {
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
      reqDto.fromDate
        ? gte(inventoryIssues.issueDate, reqDto.fromDate)
        : undefined,
      // Exclusive next-day boundary — `toDate` parses to midnight UTC, `lte` would drop same-day rows.
      reqDto.toDate
        ? lt(
            inventoryIssues.issueDate,
            new Date(reqDto.toDate.getTime() + 24 * 60 * 60 * 1000),
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
        with: ISSUE_DETAIL_WITH,
      }),
      this.db.select({ total: count() }).from(inventoryIssues).where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(InventoryIssueResDto, entities, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(countRows[0]?.total ?? 0, reqDto),
    );
  }

  async getInventoryIssueDetail(
    issueId: string,
  ): Promise<InventoryIssueResDto> {
    const issue = await this.db.query.inventoryIssues.findFirst({
      where: eq(inventoryIssues.id, issueId),
      with: ISSUE_DETAIL_WITH,
    });

    if (!issue) {
      throw new AppException(ErrorCode.E096, HttpStatus.NOT_FOUND);
    }

    return plainToInstance(InventoryIssueResDto, issue, {
      excludeExtraneousValues: true,
    });
  }

  async createInventoryIssue(
    reqDto: CreateInventoryIssueReqDto,
    userId: string,
  ): Promise<InventoryIssueResDto> {
    await this.warehousesService.ensureWarehouseActive(reqDto.warehouseId);
    await this.ensureItemsValid(reqDto.items);
    await this.ensureReferencesValid(reqDto);

    let code = reqDto.code;
    if (code) {
      await this.validateCodeUniqueness(code);
    } else {
      code = await this.generateIssueCode(reqDto.issueDate);
    }

    const { items, ...issueFields } = reqDto;

    const issueId = await this.db.transaction(async (tx) => {
      const [issue] = await tx
        .insert(inventoryIssues)
        .values({ ...issueFields, code, createdBy: userId })
        .returning();

      await this.createItems(tx, issue.id, items);

      return issue.id;
    });

    return this.getInventoryIssueDetail(issueId);
  }

  async updateInventoryIssue(
    issueId: string,
    reqDto: UpdateInventoryIssueReqDto,
  ): Promise<InventoryIssueResDto> {
    await this.ensureIssueDraft(issueId);

    if (reqDto.items !== undefined) {
      await this.ensureItemsValid(reqDto.items);
    }
    await this.ensureReferencesValid(reqDto);

    const { items, ...issueFields } = reqDto;

    await this.db.transaction(async (tx) => {
      await tx
        .update(inventoryIssues)
        .set(issueFields)
        .where(eq(inventoryIssues.id, issueId));

      if (items !== undefined) {
        await this.replaceItems(tx, issueId, items);
      }
    });

    return this.getInventoryIssueDetail(issueId);
  }

  async deleteInventoryIssue(issueId: string): Promise<void> {
    await this.ensureIssueDraft(issueId);

    await this.db
      .delete(inventoryIssues)
      .where(eq(inventoryIssues.id, issueId));
  }

  /** `DRAFT → POSTED` — sinh bút toán + cập nhật tồn qua `InventoryPostingService`, sau đó phiếu
   * bất biến. Xem `docs/workflows/stock-movement.md`. */
  async postInventoryIssue(issueId: string, userId: string): Promise<void> {
    const issue = await this.ensureIssueDraft(issueId);
    const items = await this.db.query.inventoryIssueItems.findMany({
      where: eq(inventoryIssueItems.issueId, issueId),
    });

    await this.db.transaction(async (tx) => {
      await this.inventoryPostingService.postDocument(tx, {
        warehouseId: issue.warehouseId,
        referenceType: InventoryReferenceType.INVENTORY_ISSUE,
        referenceId: issueId,
        transactionDate: issue.issueDate,
        createdBy: userId,
        lines: items.map((item) => ({
          itemType: item.itemType,
          productId: item.productId,
          materialId: item.materialId,
          // Xuất luôn trừ tồn — dấu âm.
          signedQuantity: -item.quantity,
          type: ISSUE_TYPE_TRANSACTION_TYPE[issue.issueType],
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
   * `InventoryPostingService.reverseDocument`. */
  async cancelInventoryIssue(issueId: string, userId: string): Promise<void> {
    const issue = await this.ensureIssueExists(issueId);
    if (issue.status === InventoryDocumentStatus.CANCELLED) {
      throw new AppException(ErrorCode.E098, HttpStatus.CONFLICT);
    }

    if (issue.status === InventoryDocumentStatus.DRAFT) {
      await this.db
        .update(inventoryIssues)
        .set({ status: InventoryDocumentStatus.CANCELLED })
        .where(eq(inventoryIssues.id, issueId));
      return;
    }

    await this.db.transaction(async (tx) => {
      await this.inventoryPostingService.reverseDocument(tx, {
        referenceType: InventoryReferenceType.INVENTORY_ISSUE,
        referenceId: issueId,
        transactionDate: new Date(),
        createdBy: userId,
      });

      await tx
        .update(inventoryIssues)
        .set({ status: InventoryDocumentStatus.CANCELLED })
        .where(eq(inventoryIssues.id, issueId));
    });
  }

  private async createItems(
    tx: DbTransaction,
    issueId: string,
    items: InventoryIssueItemReqDto[],
  ): Promise<void> {
    await tx
      .insert(inventoryIssueItems)
      .values(items.map((item) => ({ ...item, issueId })));
  }

  private async replaceItems(
    tx: DbTransaction,
    issueId: string,
    items: InventoryIssueItemReqDto[],
  ): Promise<void> {
    await tx
      .delete(inventoryIssueItems)
      .where(eq(inventoryIssueItems.issueId, issueId));

    if (items.length) {
      await this.createItems(tx, issueId, items);
    }
  }

  private async generateIssueCode(issueDate: Date): Promise<string> {
    const year = issueDate.getFullYear();
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year + 1, 0, 1);
    const [totalRows] = await this.db
      .select({ total: count() })
      .from(inventoryIssues)
      .where(
        and(
          gte(inventoryIssues.issueDate, yearStart),
          lt(inventoryIssues.issueDate, yearEnd),
        ),
      );
    return `PXK-${year}-${String((totalRows?.total ?? 0) + 1).padStart(5, '0')}`;
  }

  private async validateCodeUniqueness(code: string): Promise<void> {
    const existing = await this.db.query.inventoryIssues.findFirst({
      columns: { id: true },
      where: eq(inventoryIssues.code, code),
    });

    if (existing) {
      throw new AppException(ErrorCode.E097, HttpStatus.CONFLICT);
    }
  }

  /** Mỗi dòng phải đúng-một-trong `productId`/`materialId` khớp `itemType` (`E099`), mặt hàng
   * phải tồn tại (`E100`), và `orderItemId` (nếu có) chỉ hợp lệ trên dòng `PRODUCT` + phải khớp
   * đúng `productId` của dòng đơn hàng đó (`E107`). Không kiểm loại kho ↔ loại hàng — cố ý. */
  private async ensureItemsValid(
    items: InventoryIssueItemReqDto[],
  ): Promise<void> {
    for (const item of items) {
      const matchesType =
        item.itemType === InventoryItemType.PRODUCT
          ? item.productId !== undefined && item.materialId === undefined
          : item.materialId !== undefined && item.productId === undefined;

      if (!matchesType) {
        throw new AppException(ErrorCode.E099, HttpStatus.BAD_REQUEST);
      }
      if (item.orderItemId && item.itemType !== InventoryItemType.PRODUCT) {
        throw new AppException(ErrorCode.E107, HttpStatus.BAD_REQUEST);
      }
    }

    const productIds = [
      ...new Set(
        items.map((item) => item.productId).filter((id): id is string => !!id),
      ),
    ];
    const materialIds = [
      ...new Set(
        items.map((item) => item.materialId).filter((id): id is string => !!id),
      ),
    ];
    const orderItemIds = [
      ...new Set(
        items
          .map((item) => item.orderItemId)
          .filter((id): id is string => !!id),
      ),
    ];

    const [foundProducts, foundMaterials, foundOrderItems] = await Promise.all([
      productIds.length
        ? this.db.query.products.findMany({
            columns: { id: true },
            where: and(
              inArray(products.id, productIds),
              isNull(products.deletedAt),
            ),
          })
        : Promise.resolve<Array<{ id: string }>>([]),
      materialIds.length
        ? this.db.query.materials.findMany({
            columns: { id: true },
            where: inArray(materials.id, materialIds),
          })
        : Promise.resolve<Array<{ id: string }>>([]),
      orderItemIds.length
        ? this.db.query.orderItems.findMany({
            columns: { id: true, productId: true },
            where: inArray(orderItems.id, orderItemIds),
          })
        : Promise.resolve<Array<{ id: string; productId: string }>>([]),
    ]);

    const foundProductIds = new Set(foundProducts.map((p) => p.id));
    const foundMaterialIds = new Set(foundMaterials.map((m) => m.id));
    const orderItemById = new Map(foundOrderItems.map((oi) => [oi.id, oi]));

    for (const item of items) {
      if (item.productId && !foundProductIds.has(item.productId)) {
        throw new AppException(ErrorCode.E100, HttpStatus.NOT_FOUND);
      }
      if (item.materialId && !foundMaterialIds.has(item.materialId)) {
        throw new AppException(ErrorCode.E100, HttpStatus.NOT_FOUND);
      }
      if (item.orderItemId) {
        const orderItem = orderItemById.get(item.orderItemId);
        if (!orderItem || orderItem.productId !== item.productId) {
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

  private async ensureIssueExists(issueId: string) {
    const existing = await this.db.query.inventoryIssues.findFirst({
      where: eq(inventoryIssues.id, issueId),
    });

    if (!existing) {
      throw new AppException(ErrorCode.E096, HttpStatus.NOT_FOUND);
    }

    return existing;
  }

  private async ensureIssueDraft(issueId: string) {
    const issue = await this.ensureIssueExists(issueId);

    if (issue.status !== InventoryDocumentStatus.DRAFT) {
      throw new AppException(ErrorCode.E098, HttpStatus.CONFLICT);
    }

    return issue;
  }
}
