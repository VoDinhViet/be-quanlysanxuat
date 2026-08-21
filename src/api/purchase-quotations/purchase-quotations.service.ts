import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import {
  and,
  count,
  desc,
  eq,
  exists,
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
  items,
  PurchaseQuotationStatus,
  PurchaseRequestStatus,
  purchaseRequestItems,
  purchaseRequests,
  purchaseQuotationItemAllocations,
  purchaseQuotationItems,
  purchaseQuotationItemSuppliers,
  purchaseQuotations,
  suppliers,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { PurchaseOrdersService } from '../purchase-orders/purchase-orders.service';
import type { PurchaseOrderDraftLine } from '../purchase-orders/types/draft-order.type';
import { ApproveQuotationSelectedSupplierReqDto } from './dto/approve-quotation-selected-supplier.req.dto';
import { ApproveQuotationReqDto } from './dto/approve-quotation.req.dto';
import { CreateQuotationItemReqDto } from './dto/create-quotation-item.req.dto';
import { CreateQuotationItemSupplierReqDto } from './dto/create-quotation-item-supplier.req.dto';
import { CreateQuotationReqDto } from './dto/create-quotation.req.dto';
import { GetQuotationsReqDto } from './dto/get-quotations.req.dto';
import { PageQuotationResDto } from './dto/page-quotation.res.dto';
import { QuotationResDto } from './dto/quotation.res.dto';
import { RejectQuotationReqDto } from './dto/reject-quotation.req.dto';
import { UpdateQuotationReqDto } from './dto/update-quotation.req.dto';
import { lastPurchaseQuery } from './purchase-quotations.query';

@Injectable()
export class PurchaseQuotationsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly purchaseOrdersService: PurchaseOrdersService,
  ) {}

  async getQuotations(
    reqDto: GetQuotationsReqDto,
  ): Promise<OffsetPaginatedDto<PageQuotationResDto>> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;
    const materialKeyword = reqDto.materialKeyword
      ? `%${reqDto.materialKeyword}%`
      : undefined;

    const where = and(
      keyword ? unaccentILike(purchaseQuotations.code, keyword) : undefined,
      reqDto.status ? eq(purchaseQuotations.status, reqDto.status) : undefined,
      reqDto.createdBy
        ? eq(purchaseQuotations.createdBy, reqDto.createdBy)
        : undefined,
      reqDto.purchaseRequestId || reqDto.supplierId || materialKeyword
        ? exists(
            this.db
              .select({ one: sql`1` })
              .from(purchaseQuotationItems)
              .innerJoin(items, eq(items.id, purchaseQuotationItems.itemId))
              .where(
                and(
                  eq(purchaseQuotationItems.quotationId, purchaseQuotations.id),
                  materialKeyword
                    ? or(
                        unaccentILike(items.name, materialKeyword),
                        unaccentILike(items.code, materialKeyword),
                      )
                    : undefined,
                  reqDto.purchaseRequestId
                    ? exists(
                        this.db
                          .select({ one: sql`1` })
                          .from(purchaseQuotationItemAllocations)
                          .innerJoin(
                            purchaseRequestItems,
                            eq(
                              purchaseRequestItems.id,
                              purchaseQuotationItemAllocations.purchaseRequestItemId,
                            ),
                          )
                          .where(
                            and(
                              eq(
                                purchaseQuotationItemAllocations.quotationItemId,
                                purchaseQuotationItems.id,
                              ),
                              eq(
                                purchaseRequestItems.purchaseRequestId,
                                reqDto.purchaseRequestId,
                              ),
                            ),
                          ),
                      )
                    : undefined,
                  reqDto.supplierId
                    ? exists(
                        this.db
                          .select({ one: sql`1` })
                          .from(purchaseQuotationItemSuppliers)
                          .where(
                            and(
                              eq(
                                purchaseQuotationItemSuppliers.quotationItemId,
                                purchaseQuotationItems.id,
                              ),
                              eq(
                                purchaseQuotationItemSuppliers.supplierId,
                                reqDto.supplierId,
                              ),
                            ),
                          ),
                      )
                    : undefined,
                ),
              ),
          )
        : undefined,
      reqDto.fromDate
        ? gte(purchaseQuotations.createdAt, reqDto.fromDate)
        : undefined,
      reqDto.toDate
        ? lt(
            purchaseQuotations.createdAt,
            new Date(reqDto.toDate.getTime() + 24 * 60 * 60 * 1000),
          )
        : undefined,
    );

    const [entities, countRows] = await Promise.all([
      this.db.query.purchaseQuotations.findMany({
        where,
        limit: reqDto.limit,
        offset: reqDto.offset,
        orderBy: desc(purchaseQuotations.createdAt),
        with: {
          creatorBy: true,
          senderBy: true,
          approverBy: true,
        },
      }),
      this.db.select({ total: count() }).from(purchaseQuotations).where(where),
    ]);

    const itemCountRows = entities.length
      ? await this.db
          .select({
            quotationId: purchaseQuotationItems.quotationId,
            itemCount: sql<number>`count(*)`.mapWith(Number),
          })
          .from(purchaseQuotationItems)
          .where(
            inArray(
              purchaseQuotationItems.quotationId,
              entities.map((entity) => entity.id),
            ),
          )
          .groupBy(purchaseQuotationItems.quotationId)
      : [];
    const itemCountByQuotationId = new Map(
      itemCountRows.map((row) => [row.quotationId, row.itemCount]),
    );

    const entitiesWithItemCount = entities.map((entity) => ({
      ...entity,
      itemCount: itemCountByQuotationId.get(entity.id) ?? 0,
    }));

    return new OffsetPaginatedDto(
      plainToInstance(PageQuotationResDto, entitiesWithItemCount, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(countRows[0]?.total ?? 0, reqDto),
    );
  }

  async getQuotation(quotationId: string): Promise<QuotationResDto> {
    const quotation = await this.db.query.purchaseQuotations.findFirst({
      where: eq(purchaseQuotations.id, quotationId),
      with: {
        senderBy: true,
        approverBy: true,
        cancellerBy: true,
        creatorBy: true,
        items: {
          with: {
            item: { with: { unit: true } },
            allocations: {
              with: {
                purchaseRequestItem: {
                  with: { purchaseRequest: true, item: true },
                },
              },
            },
            suppliers: { with: { supplier: true, selectorBy: true } },
          },
        },
      },
    });

    if (!quotation) {
      throw new AppException(ErrorCode.E117, HttpStatus.NOT_FOUND);
    }

    const quotationItems = quotation.items;

    const itemIds = [...new Set(quotationItems.map((item) => item.item.id))];
    const supplierIds = [
      ...new Set(
        quotationItems.flatMap((item) =>
          item.suppliers.map((supplier) => supplier.supplierId),
        ),
      ),
    ];

    const lastPurchaseRows =
      itemIds.length && supplierIds.length
        ? await lastPurchaseQuery(this.db, itemIds, supplierIds)
        : [];
    const lastPurchaseByKey = new Map(
      lastPurchaseRows.map((row) => [
        `${row.itemId}:${row.supplierId}`,
        { unitPrice: row.unitPrice!, orderDate: row.orderDate },
      ]),
    );

    const quotationItemsWithLastPurchase = quotationItems.map((item) => ({
      ...item,
      quantity: item.allocations.reduce(
        (sum, allocation) => sum + allocation.quantity,
        0,
      ),
      suppliers: item.suppliers.map((supplier) => ({
        ...supplier,
        lastPurchase:
          lastPurchaseByKey.get(`${item.item.id}:${supplier.supplierId}`) ??
          null,
      })),
    }));

    return plainToInstance(
      QuotationResDto,
      { ...quotation, items: quotationItemsWithLastPurchase },
      { excludeExtraneousValues: true },
    );
  }

  async createQuotation(
    reqDto: CreateQuotationReqDto,
    userId: string,
  ): Promise<void> {
    const { items: itemsReq, ...quotationFields } = reqDto;
    const quotationItems = await this.prepareQuotationItems(itemsReq);

    await this.db.transaction(async (tx) => {
      const code = await this.generateQuotationCode(tx);
      const [quotation] = await tx
        .insert(purchaseQuotations)
        .values({ ...quotationFields, code, createdBy: userId })
        .returning({ id: purchaseQuotations.id });

      await this.createQuotationItems(tx, quotation.id, quotationItems);
    });
  }

  async updateQuotation(
    quotationId: string,
    reqDto: UpdateQuotationReqDto,
  ): Promise<void> {
    await this.ensureQuotationStatus(
      quotationId,
      PurchaseQuotationStatus.DRAFT,
    );

    const { items: itemsReq, ...quotationFields } = reqDto;
    const quotationItems = await this.prepareQuotationItems(itemsReq);

    await this.db.transaction(async (tx) => {
      await tx
        .delete(purchaseQuotationItems)
        .where(eq(purchaseQuotationItems.quotationId, quotationId));

      await this.createQuotationItems(tx, quotationId, quotationItems);

      await tx
        .update(purchaseQuotations)
        .set({ ...quotationFields })
        .where(eq(purchaseQuotations.id, quotationId));
    });
  }

  async deleteQuotation(quotationId: string): Promise<void> {
    await this.ensureQuotationStatus(
      quotationId,
      PurchaseQuotationStatus.DRAFT,
    );

    await this.db
      .delete(purchaseQuotations)
      .where(eq(purchaseQuotations.id, quotationId));
  }

  async sendQuotation(quotationId: string, userId: string): Promise<void> {
    await this.ensureQuotationStatus(
      quotationId,
      PurchaseQuotationStatus.DRAFT,
    );

    const items = await this.db.query.purchaseQuotationItems.findMany({
      columns: { id: true },
      where: eq(purchaseQuotationItems.quotationId, quotationId),
      with: { suppliers: { columns: { unitPrice: true } } },
    });

    if (!items.length) {
      throw new AppException(ErrorCode.E131, HttpStatus.BAD_REQUEST);
    }

    for (const item of items) {
      if (!item.suppliers.length) {
        throw new AppException(ErrorCode.E130, HttpStatus.BAD_REQUEST);
      }
      if (item.suppliers.some((supplier) => supplier.unitPrice === null)) {
        throw new AppException(ErrorCode.E120, HttpStatus.BAD_REQUEST);
      }
    }

    await this.db
      .update(purchaseQuotations)
      .set({
        status: PurchaseQuotationStatus.PENDING_APPROVAL,
        sentBy: userId,
        sentAt: new Date(),
      })
      .where(eq(purchaseQuotations.id, quotationId));
  }

  async approveQuotation(
    quotationId: string,
    reqDto: ApproveQuotationReqDto,
    userId: string,
  ): Promise<void> {
    await this.ensureQuotationStatus(
      quotationId,
      PurchaseQuotationStatus.PENDING_APPROVAL,
    );

    const items = await this.db.query.purchaseQuotationItems.findMany({
      columns: { id: true },
      where: eq(purchaseQuotationItems.quotationId, quotationId),
      with: {
        allocations: {
          columns: {
            purchaseRequestItemId: true,
            quantity: true,
            quantityAdjustmentReason: true,
          },
        },
        suppliers: {
          columns: {
            id: true,
            supplierId: true,
            unitPrice: true,
            leadTimeDays: true,
          },
        },
      },
    });

    this.validateSelectedSuppliers(items, reqDto.selectedSuppliers);

    const supplierRowById = new Map(
      items.flatMap((item) => item.suppliers.map((s) => [s.id, s] as const)),
    );

    const linesBySupplierId = new Map<string, PurchaseOrderDraftLine[]>();
    for (const item of items) {
      const selection = reqDto.selectedSuppliers.find(
        (s) => s.quotationItemId === item.id,
      )!;
      const selectedSupplierRow = supplierRowById.get(
        selection.quotationItemSupplierId,
      )!;
      const lines = linesBySupplierId.get(selectedSupplierRow.supplierId) ?? [];
      for (const allocation of item.allocations) {
        lines.push({
          purchaseRequestItemId: allocation.purchaseRequestItemId,
          quotationItemSupplierId: selectedSupplierRow.id,
          quantity: allocation.quantity,
          unitPrice: selectedSupplierRow.unitPrice,
          leadTimeDays: selectedSupplierRow.leadTimeDays,
          quantityAdjustmentReason: allocation.quantityAdjustmentReason,
        });
      }
      linesBySupplierId.set(selectedSupplierRow.supplierId, lines);
    }

    const selectedSupplierRowIds = reqDto.selectedSuppliers.map(
      (s) => s.quotationItemSupplierId,
    );

    await this.db.transaction(async (tx) => {
      await tx
        .update(purchaseQuotationItemSuppliers)
        .set({ selectedBy: userId, selectedAt: new Date() })
        .where(
          inArray(purchaseQuotationItemSuppliers.id, selectedSupplierRowIds),
        );

      await tx
        .update(purchaseQuotations)
        .set({
          status: PurchaseQuotationStatus.APPROVED,
          approvedBy: userId,
          approvedAt: new Date(),
        })
        .where(eq(purchaseQuotations.id, quotationId));

      await this.purchaseOrdersService.createDraftOrdersFromQuotation(tx, {
        quotationId,
        createdBy: userId,
        linesBySupplierId,
      });
    });
  }

  async rejectQuotation(
    quotationId: string,
    reqDto: RejectQuotationReqDto,
    userId: string,
  ): Promise<void> {
    await this.ensureQuotationStatus(
      quotationId,
      PurchaseQuotationStatus.PENDING_APPROVAL,
    );

    await this.db
      .update(purchaseQuotations)
      .set({
        status: PurchaseQuotationStatus.CANCELLED,
        cancelledBy: userId,
        cancelledAt: new Date(),
        cancellationReason: reqDto.reason,
      })
      .where(eq(purchaseQuotations.id, quotationId));
  }

  async recallQuotation(quotationId: string): Promise<void> {
    await this.ensureQuotationStatus(
      quotationId,
      PurchaseQuotationStatus.APPROVED,
    );

    const hasOrderedOrders =
      await this.purchaseOrdersService.hasOrderedOrdersForQuotation(
        quotationId,
      );
    if (hasOrderedOrders) {
      throw new AppException(ErrorCode.E133, HttpStatus.CONFLICT);
    }

    const items = await this.db.query.purchaseQuotationItems.findMany({
      columns: { id: true },
      where: eq(purchaseQuotationItems.quotationId, quotationId),
    });
    const itemIds = items.map((item) => item.id);

    await this.db.transaction(async (tx) => {
      await this.purchaseOrdersService.deleteDraftOrdersByQuotation(
        tx,
        quotationId,
      );

      if (itemIds.length) {
        await tx
          .update(purchaseQuotationItemSuppliers)
          .set({ selectedBy: null, selectedAt: null })
          .where(
            inArray(purchaseQuotationItemSuppliers.quotationItemId, itemIds),
          );
      }

      await tx
        .update(purchaseQuotations)
        .set({
          status: PurchaseQuotationStatus.DRAFT,
          approvedBy: null,
          approvedAt: null,
        })
        .where(eq(purchaseQuotations.id, quotationId));
    });
  }

  private async createQuotationItems(
    tx: DbTransaction,
    quotationId: string,
    itemsReq: CreateQuotationItemReqDto[],
  ): Promise<void> {
    if (!itemsReq.length) return;

    const itemRows = itemsReq.map((item) => ({
      id: crypto.randomUUID(),
      quotationId,
      itemId: item.itemId,
    }));
    await tx.insert(purchaseQuotationItems).values(itemRows);

    await tx.insert(purchaseQuotationItemAllocations).values(
      itemsReq.flatMap((item, index) =>
        item.allocations.map((allocation) => ({
          ...allocation,
          quotationItemId: itemRows[index].id,
        })),
      ),
    );

    const supplierRows = itemsReq.flatMap((item, index) =>
      item.suppliers.map((supplier) => ({
        ...supplier,
        quotationItemId: itemRows[index].id,
      })),
    );

    if (supplierRows.length) {
      await tx.insert(purchaseQuotationItemSuppliers).values(supplierRows);
    }
  }

  private validateSelectedSuppliers(
    items: { id: string; suppliers: { id: string }[] }[],
    selectedSuppliers: ApproveQuotationSelectedSupplierReqDto[],
  ): void {
    if (selectedSuppliers.length !== items.length) {
      throw new AppException(ErrorCode.E132, HttpStatus.CONFLICT);
    }

    const supplierIdsByItemId = new Map(
      items.map((item) => [item.id, new Set(item.suppliers.map((s) => s.id))]),
    );

    const seenItemIds = new Set<string>();
    for (const selection of selectedSuppliers) {
      if (seenItemIds.has(selection.quotationItemId)) {
        throw new AppException(ErrorCode.E132, HttpStatus.CONFLICT);
      }
      seenItemIds.add(selection.quotationItemId);

      const validSupplierRowIds = supplierIdsByItemId.get(
        selection.quotationItemId,
      );
      if (!validSupplierRowIds?.has(selection.quotationItemSupplierId)) {
        throw new AppException(ErrorCode.E132, HttpStatus.CONFLICT);
      }
    }
  }

  /** Gộp payload theo `itemId` rồi validate mảng đã gộp — dùng chung cho `createQuotation`/
   * `updateQuotation`, cả hai đều cần đúng 3 bước này theo đúng thứ tự trước khi ghi. */
  private async prepareQuotationItems(
    itemsReq: CreateQuotationItemReqDto[],
  ): Promise<CreateQuotationItemReqDto[]> {
    const quotationItems = this.mergeItemsByItemId(itemsReq);

    await this.ensureSuppliersExist(
      quotationItems.flatMap((item) => item.suppliers.map((s) => s.supplierId)),
    );
    await this.validateAllocations(quotationItems);

    return quotationItems;
  }

  private async ensureSuppliersExist(supplierIds: string[]): Promise<void> {
    const uniqueIds = [...new Set(supplierIds)];

    const [{ total }] = await this.db
      .select({ total: count() })
      .from(suppliers)
      .where(
        and(inArray(suppliers.id, uniqueIds), isNull(suppliers.deletedAt)),
      );

    if (total !== uniqueIds.length) {
      throw new AppException(ErrorCode.E019, HttpStatus.NOT_FOUND);
    }
  }

  /** Gộp các dòng payload cùng `itemId` thành một dòng vật tư — nối `allocations`, union NCC qua
   * `mergeAndValidateSuppliers` (có thể ném E129). DB vẫn giữ
   * `uq_purchase_quotation_items_quotation_item` làm chốt chặn cuối, không còn là cơ chế chính
   * (`docs/domains/purchasing.md`). */
  private mergeItemsByItemId(
    itemsReq: CreateQuotationItemReqDto[],
  ): CreateQuotationItemReqDto[] {
    const mergedByItemId = new Map<string, CreateQuotationItemReqDto>();

    for (const item of itemsReq) {
      const merged = mergedByItemId.get(item.itemId);
      mergedByItemId.set(item.itemId, {
        ...item,
        allocations: [...(merged?.allocations ?? []), ...item.allocations],
        suppliers: this.mergeAndValidateSuppliers(
          merged?.suppliers ?? [],
          item.suppliers,
        ),
      });
    }

    return [...mergedByItemId.values()];
  }

  /** Cùng `supplierId` mà `unitPrice`/`leadTimeDays`/`note` khác nhau là xung đột thật, ném E129
   * — không tự chọn hộ giá nào. Trùng khít thì giữ lần xuất hiện đầu. */
  private mergeAndValidateSuppliers(
    base: CreateQuotationItemSupplierReqDto[],
    incoming: CreateQuotationItemSupplierReqDto[],
  ): CreateQuotationItemSupplierReqDto[] {
    const bySupplierId = new Map(base.map((s) => [s.supplierId, s]));

    for (const supplier of incoming) {
      const existing = bySupplierId.get(supplier.supplierId);
      if (!existing) {
        bySupplierId.set(supplier.supplierId, supplier);
        continue;
      }
      if (
        existing.unitPrice !== supplier.unitPrice ||
        existing.leadTimeDays !== supplier.leadTimeDays ||
        existing.note !== supplier.note
      ) {
        throw new AppException(ErrorCode.E129, HttpStatus.CONFLICT);
      }
    }

    return [...bySupplierId.values()];
  }

  /** Mỗi vật tư phải có ≥1 phân bổ (E150); không dòng ĐXMH nào lặp trong toàn payload kể cả khác vật
   * tư (E128 — lặp sẽ nhân đôi quotedQuantity ở sổ cái); mọi dòng ĐXMH phải thuộc phiếu APPROVED và
   * chưa hủy tay (E125), và đúng vật tư của dòng báo giá chứa nó (E149). */
  private async validateAllocations(
    itemsReq: CreateQuotationItemReqDto[],
  ): Promise<void> {
    if (itemsReq.some((item) => !item.allocations.length)) {
      throw new AppException(ErrorCode.E150, HttpStatus.BAD_REQUEST);
    }

    const allRequestItemIds = itemsReq.flatMap((item) =>
      item.allocations.map((allocation) => allocation.purchaseRequestItemId),
    );
    const uniqueRequestItemIds = [...new Set(allRequestItemIds)];
    if (uniqueRequestItemIds.length !== allRequestItemIds.length) {
      throw new AppException(ErrorCode.E128, HttpStatus.CONFLICT);
    }

    const requestItemRows = await this.db
      .select({
        id: purchaseRequestItems.id,
        itemId: purchaseRequestItems.itemId,
      })
      .from(purchaseRequestItems)
      .innerJoin(
        purchaseRequests,
        eq(purchaseRequests.id, purchaseRequestItems.purchaseRequestId),
      )
      .where(
        and(
          inArray(purchaseRequestItems.id, uniqueRequestItemIds),
          eq(purchaseRequests.status, PurchaseRequestStatus.APPROVED),
          isNull(purchaseRequestItems.cancelledAt),
        ),
      );

    if (requestItemRows.length !== uniqueRequestItemIds.length) {
      throw new AppException(ErrorCode.E125, HttpStatus.CONFLICT);
    }

    const itemIdByRequestItemId = new Map(
      requestItemRows.map((row) => [row.id, row.itemId]),
    );
    const hasItemMismatch = itemsReq.some((item) =>
      item.allocations.some(
        (allocation) =>
          itemIdByRequestItemId.get(allocation.purchaseRequestItemId) !==
          item.itemId,
      ),
    );
    if (hasItemMismatch) {
      throw new AppException(ErrorCode.E149, HttpStatus.CONFLICT);
    }
  }

  private async ensureQuotationStatus(
    quotationId: string,
    expected: PurchaseQuotationStatus,
  ): Promise<void> {
    const quotation = await this.db.query.purchaseQuotations.findFirst({
      columns: { id: true, status: true },
      where: eq(purchaseQuotations.id, quotationId),
    });

    if (!quotation) {
      throw new AppException(ErrorCode.E117, HttpStatus.NOT_FOUND);
    }

    if (quotation.status !== expected) {
      throw new AppException(ErrorCode.E118, HttpStatus.CONFLICT);
    }
  }

  private async generateQuotationCode(tx: DbTransaction): Promise<string> {
    const sequence = await generateDocumentSequence(
      tx,
      DocumentType.PURCHASE_QUOTATION,
    );

    return `RFQ-${String(sequence).padStart(5, '0')}`;
  }
}
