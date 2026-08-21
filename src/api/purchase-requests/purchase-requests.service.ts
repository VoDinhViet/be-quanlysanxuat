import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  getTableColumns,
  gte,
  inArray,
  isNull,
  lt,
  or,
  sql,
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
  departments,
  files,
  inventoryReceipts,
  ItemType,
  items,
  PurchaseRequestStatus,
  purchaseRequestItems,
  purchaseRequests,
  units,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import {
  onHandQuantityByItemSubquery,
  itemStockColumns,
  jobIssueDemandSubquery,
} from '../inventory/item-stock.query';
import { CreatePurchaseRequestItemReqDto } from './dto/create-purchase-request-item.req.dto';
import { CreatePurchaseRequestReqDto } from './dto/create-purchase-request.req.dto';
import { GetPurchaseRequestsReqDto } from './dto/get-purchase-requests.req.dto';
import { PagePurchaseRequestResDto } from './dto/page-purchase-request.res.dto';
import { PurchaseRequestResDto } from './dto/purchase-request.res.dto';
import { RejectPurchaseRequestReqDto } from './dto/reject-purchase-request.req.dto';
import { UpdatePurchaseRequestItemReqDto } from './dto/update-purchase-request-item.req.dto';
import { CreateShortageRequestInput } from './types/shortage-request.type';

@Injectable()
export class PurchaseRequestsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async getPurchaseRequests(
    reqDto: GetPurchaseRequestsReqDto,
  ): Promise<OffsetPaginatedDto<PagePurchaseRequestResDto>> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;
    const materialKeyword = reqDto.materialKeyword
      ? `%${reqDto.materialKeyword}%`
      : undefined;

    const where = and(
      keyword ? unaccentILike(purchaseRequests.code, keyword) : undefined,
      materialKeyword
        ? exists(
            this.db
              .select({ one: sql`1` })
              .from(purchaseRequestItems)
              .innerJoin(items, eq(items.id, purchaseRequestItems.itemId))
              .where(
                and(
                  eq(
                    purchaseRequestItems.purchaseRequestId,
                    purchaseRequests.id,
                  ),
                  or(
                    unaccentILike(items.name, materialKeyword),
                    unaccentILike(items.code, materialKeyword),
                  ),
                ),
              ),
          )
        : undefined,
      reqDto.productionOrderId
        ? eq(purchaseRequests.productionOrderId, reqDto.productionOrderId)
        : undefined,
      reqDto.productionJobId
        ? eq(purchaseRequests.productionJobId, reqDto.productionJobId)
        : undefined,
      reqDto.requesterId
        ? eq(purchaseRequests.createdBy, reqDto.requesterId)
        : undefined,
      reqDto.departmentId
        ? eq(purchaseRequests.departmentId, reqDto.departmentId)
        : undefined,
      reqDto.status ? eq(purchaseRequests.status, reqDto.status) : undefined,
      reqDto.neededDate
        ? eq(purchaseRequests.neededDate, reqDto.neededDate)
        : undefined,
      reqDto.createdDateFrom
        ? gte(purchaseRequests.createdAt, reqDto.createdDateFrom)
        : undefined,
      reqDto.createdDateTo
        ? lt(
            purchaseRequests.createdAt,
            new Date(reqDto.createdDateTo.getTime() + 24 * 60 * 60 * 1000),
          )
        : undefined,
    );

    const [entities, countRows] = await Promise.all([
      this.db.query.purchaseRequests.findMany({
        where,
        limit: reqDto.limit,
        offset: reqDto.offset,
        orderBy: desc(purchaseRequests.createdAt),
        with: {
          department: true,
          requesterBy: true,
          senderBy: true,
          approverBy: true,
          rejecterBy: true,
          productionOrder: true,
          productionJob: true,
        },
      }),
      this.db.select({ total: count() }).from(purchaseRequests).where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(PagePurchaseRequestResDto, entities, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(countRows[0]?.total ?? 0, reqDto),
    );
  }

  async getPurchaseRequest(
    purchaseRequestId: string,
  ): Promise<PurchaseRequestResDto> {
    const purchaseRequest = await this.db.query.purchaseRequests.findFirst({
      where: eq(purchaseRequests.id, purchaseRequestId),
      with: {
        department: true,
        requesterBy: true,
        senderBy: true,
        approverBy: true,
        rejecterBy: true,
        productionOrder: true,
        productionJob: true,
      },
    });

    if (!purchaseRequest) {
      throw new AppException(ErrorCode.E112, HttpStatus.NOT_FOUND);
    }

    const [lines, receipts] = await Promise.all([
      this.getPurchaseRequestLines(purchaseRequestId, {
        productionJobId: purchaseRequest.productionJobId,
        productionOrderId: purchaseRequest.productionOrderId,
      }),
      this.db.query.inventoryReceipts.findMany({
        where: eq(inventoryReceipts.purchaseRequestId, purchaseRequestId),
        orderBy: desc(inventoryReceipts.receiptDate),
      }),
    ]);

    return plainToInstance(
      PurchaseRequestResDto,
      { ...purchaseRequest, items: lines, receipts },
      { excludeExtraneousValues: true },
    );
  }

  /** `purchase_request_items` không có `sortOrder`, và relational query API không order được
   * theo cột của bảng join (`items.code`) — dùng `.select()` + join để Postgres sort thay vì
   * `.sort()` trong JS. 4 số tồn/nhu cầu dùng chung công thức với `InventoryReceiptsService` —
   * xem `item-stock.query.ts`. */
  private async getPurchaseRequestLines(
    purchaseRequestId: string,
    scope: {
      productionJobId: string | null;
      productionOrderId: string | null;
    },
  ) {
    const balance = onHandQuantityByItemSubquery(this.db);
    const demand = jobIssueDemandSubquery(this.db, scope);

    const rows = await this.db
      .select({
        id: purchaseRequestItems.id,
        quantity: purchaseRequestItems.quantity,
        note: purchaseRequestItems.note,
        ...itemStockColumns(balance, demand),
        item: getTableColumns(items),
        unit: getTableColumns(units),
        imageFile: getTableColumns(files),
      })
      .from(purchaseRequestItems)
      .innerJoin(items, eq(items.id, purchaseRequestItems.itemId))
      .innerJoin(units, eq(units.id, items.unitId))
      .leftJoin(files, eq(files.id, items.imageFileId))
      .leftJoin(balance, eq(balance.itemId, items.id))
      .leftJoin(demand, eq(demand.itemId, items.id))
      .where(eq(purchaseRequestItems.purchaseRequestId, purchaseRequestId))
      .orderBy(asc(items.code));

    // `unit`/`imageFile` join phẳng ở cấp gốc — lồng vào trong `item` cho khớp shape
    // `OrderItemRefResDto` (`item.unit`, `item.image`) mà `.select()` không tự lồng được.
    // `imageFile` bắt buộc ở cấp gốc: drizzle chỉ null-collapse LEFT JOIN trượt ở độ sâu 1
    // (`mapResultRow`), lồng sẵn trong `item` sẽ ra `{id: null, ...}` chứ không phải `null`.
    return rows.map(({ item, unit, imageFile, ...line }) => ({
      ...line,
      item: { ...item, unit, imageFile },
    }));
  }

  async updatePurchaseRequestItem(
    purchaseRequestId: string,
    purchaseRequestItemId: string,
    reqDto: UpdatePurchaseRequestItemReqDto,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await this.ensurePurchaseRequestEditable(tx, purchaseRequestId);

      const item = await tx.query.purchaseRequestItems.findFirst({
        columns: { id: true },
        where: and(
          eq(purchaseRequestItems.id, purchaseRequestItemId),
          eq(purchaseRequestItems.purchaseRequestId, purchaseRequestId),
        ),
      });

      if (!item) {
        throw new AppException(ErrorCode.E113, HttpStatus.NOT_FOUND);
      }

      await tx
        .update(purchaseRequestItems)
        .set({ ...reqDto })
        .where(eq(purchaseRequestItems.id, purchaseRequestItemId));
    });
  }

  /** Phải còn ≥ 1 dòng sau khi xoá (`E115`): phiếu 0 dòng vẫn `send`/`approve` được vì không route
   * nào đếm dòng. Bỏ hẳn phiếu thì dùng `deletePurchaseRequest`. */
  async deletePurchaseRequestItem(
    purchaseRequestId: string,
    purchaseRequestItemId: string,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await this.ensurePurchaseRequestEditable(tx, purchaseRequestId);

      const item = await tx.query.purchaseRequestItems.findFirst({
        columns: { id: true },
        where: and(
          eq(purchaseRequestItems.id, purchaseRequestItemId),
          eq(purchaseRequestItems.purchaseRequestId, purchaseRequestId),
        ),
      });

      if (!item) {
        throw new AppException(ErrorCode.E113, HttpStatus.NOT_FOUND);
      }

      const [{ total }] = await tx
        .select({ total: count() })
        .from(purchaseRequestItems)
        .where(eq(purchaseRequestItems.purchaseRequestId, purchaseRequestId));

      if (total <= 1) {
        throw new AppException(ErrorCode.E115, HttpStatus.CONFLICT);
      }

      await tx
        .delete(purchaseRequestItems)
        .where(eq(purchaseRequestItems.id, purchaseRequestItemId));
    });
  }

  /** Một `delete` chạm 3 bảng: dòng vật tư theo `ON DELETE CASCADE`, phiếu nhập kho chỉ bị bỏ
   * trống `purchaseRequestId` (`set null`) — mất trace, có chủ ý. Xem
   * `docs/domains/purchase-requests.md`. */
  async deletePurchaseRequest(purchaseRequestId: string): Promise<void> {
    await this.ensurePurchaseRequestDeletable(purchaseRequestId);

    await this.db
      .delete(purchaseRequests)
      .where(eq(purchaseRequests.id, purchaseRequestId));
  }

  async sendPurchaseRequest(
    purchaseRequestId: string,
    userId: string,
  ): Promise<void> {
    await this.ensurePurchaseRequestDraft(purchaseRequestId);

    await this.db
      .update(purchaseRequests)
      .set({
        status: PurchaseRequestStatus.PENDING_APPROVAL,
        sentBy: userId,
        sentAt: new Date(),
      })
      .where(eq(purchaseRequests.id, purchaseRequestId));
  }

  async approvePurchaseRequest(
    purchaseRequestId: string,
    userId: string,
  ): Promise<void> {
    await this.ensurePendingApproval(purchaseRequestId);

    await this.db
      .update(purchaseRequests)
      .set({
        status: PurchaseRequestStatus.APPROVED,
        approvedBy: userId,
        approvedAt: new Date(),
      })
      .where(eq(purchaseRequests.id, purchaseRequestId));
  }

  /** `REJECTED` là điểm dừng — không có route đưa lại `DRAFT`. Chỉ sửa/xoá dòng vật tư
   * (`ensurePurchaseRequestEditable`) mới mở lại được, coi như làm lại từ đầu. */
  async rejectPurchaseRequest(
    purchaseRequestId: string,
    reqDto: RejectPurchaseRequestReqDto,
    userId: string,
  ): Promise<void> {
    await this.ensurePendingApproval(purchaseRequestId);

    await this.db
      .update(purchaseRequests)
      .set({
        status: PurchaseRequestStatus.REJECTED,
        rejectedBy: userId,
        rejectedAt: new Date(),
        rejectionReason: reqDto.reason,
      })
      .where(eq(purchaseRequests.id, purchaseRequestId));
  }

  /** Chỉ dùng cho `sendPurchaseRequest` — bắt buộc đúng `DRAFT`, không tự mở lại như
   * `ensurePurchaseRequestEditable`. */
  private async ensurePurchaseRequestDraft(purchaseRequestId: string) {
    const purchaseRequest = await this.db.query.purchaseRequests.findFirst({
      columns: { id: true, status: true },
      where: eq(purchaseRequests.id, purchaseRequestId),
    });

    if (!purchaseRequest) {
      throw new AppException(ErrorCode.E112, HttpStatus.NOT_FOUND);
    }

    if (purchaseRequest.status !== PurchaseRequestStatus.DRAFT) {
      throw new AppException(ErrorCode.E114, HttpStatus.CONFLICT);
    }

    return purchaseRequest;
  }

  /** Sửa/xoá dòng hợp lệ khi `DRAFT` hoặc `REJECTED` — `PENDING_APPROVAL`/`APPROVED` khoá cứng
   * (`E114`). Đang `REJECTED` thì tự đưa về `DRAFT` ngay trong transaction của nơi gọi (coi như
   * sửa lại từ đầu), giữ nguyên lịch sử `rejectedBy`/`rejectedAt`/`rejectionReason`. */
  private async ensurePurchaseRequestEditable(
    tx: DbTransaction,
    purchaseRequestId: string,
  ) {
    const purchaseRequest = await tx.query.purchaseRequests.findFirst({
      columns: { id: true, status: true },
      where: eq(purchaseRequests.id, purchaseRequestId),
    });

    if (!purchaseRequest) {
      throw new AppException(ErrorCode.E112, HttpStatus.NOT_FOUND);
    }

    if (
      purchaseRequest.status === PurchaseRequestStatus.PENDING_APPROVAL ||
      purchaseRequest.status === PurchaseRequestStatus.APPROVED
    ) {
      throw new AppException(ErrorCode.E114, HttpStatus.CONFLICT);
    }

    if (purchaseRequest.status === PurchaseRequestStatus.REJECTED) {
      await tx
        .update(purchaseRequests)
        .set({ status: PurchaseRequestStatus.DRAFT })
        .where(eq(purchaseRequests.id, purchaseRequestId));
    }

    return purchaseRequest;
  }

  /** Sibling read-only của `ensurePurchaseRequestEditable`: cùng cửa `DRAFT`/`REJECTED` nhưng cố
   * ý không mở `REJECTED → DRAFT` vì phiếu bị xoá ngay sau đó. Read-only nên
   * `deletePurchaseRequest` không cần transaction. */
  private async ensurePurchaseRequestDeletable(purchaseRequestId: string) {
    const purchaseRequest = await this.db.query.purchaseRequests.findFirst({
      columns: { id: true, status: true },
      where: eq(purchaseRequests.id, purchaseRequestId),
    });

    if (!purchaseRequest) {
      throw new AppException(ErrorCode.E112, HttpStatus.NOT_FOUND);
    }

    if (
      purchaseRequest.status !== PurchaseRequestStatus.DRAFT &&
      purchaseRequest.status !== PurchaseRequestStatus.REJECTED
    ) {
      throw new AppException(ErrorCode.E114, HttpStatus.CONFLICT);
    }

    return purchaseRequest;
  }

  /** `approve`/`reject` chỉ hợp lệ từ `PENDING_APPROVAL` — sibling của `ensurePurchaseRequestDraft`. */
  private async ensurePendingApproval(purchaseRequestId: string) {
    const purchaseRequest = await this.db.query.purchaseRequests.findFirst({
      columns: { id: true, status: true },
      where: eq(purchaseRequests.id, purchaseRequestId),
    });

    if (!purchaseRequest) {
      throw new AppException(ErrorCode.E112, HttpStatus.NOT_FOUND);
    }

    if (purchaseRequest.status !== PurchaseRequestStatus.PENDING_APPROVAL) {
      throw new AppException(ErrorCode.E116, HttpStatus.CONFLICT);
    }

    return purchaseRequest;
  }

  /** Đường sinh **tay** — luôn `DRAFT`, luôn là đề xuất chung (`productionOrderId`/
   * `productionJobId` để `NULL`); muốn gắn LSX/Job thì chỉ có `createShortageRequest`. */
  async createPurchaseRequest(
    reqDto: CreatePurchaseRequestReqDto,
    userId: string,
  ): Promise<void> {
    const { items: lineItems, ...purchaseRequestFields } = reqDto;

    await Promise.all([
      this.ensureDepartmentExists(purchaseRequestFields.departmentId),
      this.ensureRequestItemsValid(lineItems),
    ]);

    await this.db.transaction(async (tx) => {
      const code = await this.generatePurchaseRequestCode(tx);

      const [purchaseRequest] = await tx
        .insert(purchaseRequests)
        .values({ ...purchaseRequestFields, code, createdBy: userId })
        .returning({ id: purchaseRequests.id });

      await tx.insert(purchaseRequestItems).values(
        lineItems.map((item) => ({
          ...item,
          purchaseRequestId: purchaseRequest.id,
        })),
      );
    });
  }

  private async ensureDepartmentExists(departmentId: string): Promise<void> {
    const department = await this.db.query.departments.findFirst({
      columns: { id: true },
      where: eq(departments.id, departmentId),
    });

    if (!department) {
      throw new AppException(ErrorCode.E014, HttpStatus.NOT_FOUND);
    }
  }

  /** Ngoài "tồn tại" còn chốt ba bất biến chỉ đường tay mới phá được: không rỗng (`E146`), không
   * trùng `itemId` trong cùng payload (`E147`) và mọi dòng phải là RM (`E148`) — đường tự động lấy
   * dòng từ `production_job_issues` nên vốn đã đúng cả ba. */
  private async ensureRequestItemsValid(
    lineItems: CreatePurchaseRequestItemReqDto[],
  ): Promise<void> {
    if (!lineItems.length) {
      throw new AppException(ErrorCode.E146, HttpStatus.BAD_REQUEST);
    }

    const itemIds = lineItems.map((item) => item.itemId);

    if (new Set(itemIds).size !== itemIds.length) {
      throw new AppException(ErrorCode.E147, HttpStatus.CONFLICT);
    }

    const found = await this.db.query.items.findMany({
      columns: { id: true, type: true },
      where: and(inArray(items.id, itemIds), isNull(items.deletedAt)),
    });

    if (found.length !== itemIds.length) {
      throw new AppException(ErrorCode.E007, HttpStatus.NOT_FOUND);
    }

    if (found.some((item) => item.type !== ItemType.RM)) {
      throw new AppException(ErrorCode.E148, HttpStatus.BAD_REQUEST);
    }
  }

  /** Đường sinh **tự động** duy nhất — gọi từ `ProductionJobsService.startJob` khi Job thiếu vật
   * tư, ghi header + dòng trong transaction của nơi gọi. Khác `createPurchaseRequest` (đường tay)
   * ở chỗ luôn gắn `productionOrderId`/`productionJobId` và `quantity` là phần thiếu đã chốt. */
  async createShortageRequest(
    tx: DbTransaction,
    input: CreateShortageRequestInput,
  ): Promise<void> {
    const { items, ...purchaseRequestFields } = input;
    const code = await this.generatePurchaseRequestCode(tx);

    const [purchaseRequest] = await tx
      .insert(purchaseRequests)
      .values({ ...purchaseRequestFields, code, neededDate: new Date() })
      .returning({ id: purchaseRequests.id });

    await tx.insert(purchaseRequestItems).values(
      items.map((item) => ({
        ...item,
        purchaseRequestId: purchaseRequest.id,
      })),
    );
  }

  private async generatePurchaseRequestCode(
    tx: DbTransaction,
  ): Promise<string> {
    const sequence = await generateDocumentSequence(
      tx,
      DocumentType.PURCHASE_REQUEST,
    );

    return `PR-${String(sequence).padStart(5, '0')}`;
  }
}
