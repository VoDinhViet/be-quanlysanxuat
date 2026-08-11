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
import { CreateQuotationReqDto } from './dto/create-quotation.req.dto';
import { GetQuotationsReqDto } from './dto/get-quotations.req.dto';
import { PageQuotationResDto } from './dto/page-quotation.res.dto';
import { QuotationResDto } from './dto/quotation.res.dto';
import { RejectQuotationReqDto } from './dto/reject-quotation.req.dto';
import { UpdateQuotationReqDto } from './dto/update-quotation.req.dto';
import { lastPurchaseQuery } from './purchase-quotations.query';
import type { QuotationDetailItem } from './types/quotation-detail.type';

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
              .innerJoin(
                purchaseRequestItems,
                eq(
                  purchaseRequestItems.id,
                  purchaseQuotationItems.purchaseRequestItemId,
                ),
              )
              .innerJoin(items, eq(items.id, purchaseRequestItems.itemId))
              .where(
                and(
                  eq(purchaseQuotationItems.quotationId, purchaseQuotations.id),
                  reqDto.purchaseRequestId
                    ? eq(
                        purchaseRequestItems.purchaseRequestId,
                        reqDto.purchaseRequestId,
                      )
                    : undefined,
                  materialKeyword
                    ? or(
                        unaccentILike(items.name, materialKeyword),
                        unaccentILike(items.code, materialKeyword),
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
            purchaseRequestItem: {
              with: { purchaseRequest: true, item: { with: { unit: true } } },
            },
            suppliers: { with: { supplier: true, selectorBy: true } },
          },
        },
      },
    });

    if (!quotation) {
      throw new AppException(ErrorCode.E117, HttpStatus.NOT_FOUND);
    }

    // Bốn tầng `with` lồng nhau (items -> purchaseRequestItem -> {purchaseRequest, item -> unit},
    // items -> suppliers -> {supplier, selectorBy}) vượt độ sâu suy luận type của drizzle — ép kiểu
    // tường minh để .map()/.flatMap() không rơi về `any`, dữ liệu thực tế lúc chạy không đổi.
    const quotationItems = quotation.items as QuotationDetailItem[];

    const itemIds = [
      ...new Set(
        quotationItems.map((item) => item.purchaseRequestItem.item.id),
      ),
    ];
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
      suppliers: item.suppliers.map((supplier) => ({
        ...supplier,
        lastPurchase:
          lastPurchaseByKey.get(
            `${item.purchaseRequestItem.item.id}:${supplier.supplierId}`,
          ) ?? null,
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
    this.validateItemSuppliers(reqDto.items);
    await this.ensureSuppliersExist(
      reqDto.items.flatMap((item) => item.suppliers.map((s) => s.supplierId)),
    );
    await this.validateRequestItems(reqDto.items);

    const { items: quotationItems, ...quotationFields } = reqDto;

    await this.db.transaction(async (tx) => {
      const code = await this.generateQuotationCode(tx);
      const [quotation] = await tx
        .insert(purchaseQuotations)
        .values({ ...quotationFields, code, createdBy: userId })
        .returning({ id: purchaseQuotations.id });

      await this.insertQuotationItems(tx, quotation.id, quotationItems);
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
    this.validateItemSuppliers(reqDto.items);
    await this.ensureSuppliersExist(
      reqDto.items.flatMap((item) => item.suppliers.map((s) => s.supplierId)),
    );
    await this.validateRequestItems(reqDto.items);

    const { items: quotationItems, ...quotationFields } = reqDto;

    await this.db.transaction(async (tx) => {
      await tx
        .delete(purchaseQuotationItems)
        .where(eq(purchaseQuotationItems.quotationId, quotationId));

      await this.insertQuotationItems(tx, quotationId, quotationItems);

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
      columns: { id: true, purchaseRequestItemId: true, quantity: true },
      where: eq(purchaseQuotationItems.quotationId, quotationId),
      with: {
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
      lines.push({
        purchaseRequestItemId: item.purchaseRequestItemId,
        quotationItemSupplierId: selectedSupplierRow.id,
        quantity: item.quantity,
        unitPrice: selectedSupplierRow.unitPrice,
        leadTimeDays: selectedSupplierRow.leadTimeDays,
      });
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

  private async insertQuotationItems(
    tx: DbTransaction,
    quotationId: string,
    itemsReq: CreateQuotationItemReqDto[],
  ): Promise<void> {
    const itemRows = itemsReq.map(
      ({ suppliers: _suppliers, ...itemFields }) => ({
        ...itemFields,
        id: crypto.randomUUID(),
        quotationId,
      }),
    );

    if (itemRows.length) {
      await tx.insert(purchaseQuotationItems).values(itemRows);
    }

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

  private validateItemSuppliers(itemsReq: CreateQuotationItemReqDto[]): void {
    for (const item of itemsReq) {
      const supplierIds = item.suppliers.map((supplier) => supplier.supplierId);
      if (new Set(supplierIds).size !== supplierIds.length) {
        throw new AppException(ErrorCode.E129, HttpStatus.CONFLICT);
      }
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

  /** Mỗi dòng phải trỏ đúng một dòng ĐXMH `APPROVED` chưa hủy tay, và không trùng dòng nào trong
   * cùng payload — trùng sẽ nhân đôi `quotedQuantity` của dòng đó trên sổ cái mua hàng. */
  private async validateRequestItems(
    itemsReq: CreateQuotationItemReqDto[],
  ): Promise<void> {
    const requestItemIds = itemsReq.map((item) => item.purchaseRequestItemId);
    const uniqueIds = [...new Set(requestItemIds)];

    if (uniqueIds.length !== requestItemIds.length) {
      throw new AppException(ErrorCode.E128, HttpStatus.CONFLICT);
    }

    const [{ total }] = await this.db
      .select({ total: count() })
      .from(purchaseRequestItems)
      .innerJoin(
        purchaseRequests,
        eq(purchaseRequests.id, purchaseRequestItems.purchaseRequestId),
      )
      .where(
        and(
          inArray(purchaseRequestItems.id, uniqueIds),
          eq(purchaseRequests.status, PurchaseRequestStatus.APPROVED),
          isNull(purchaseRequestItems.cancelledAt),
        ),
      );

    if (total !== uniqueIds.length) {
      throw new AppException(ErrorCode.E125, HttpStatus.CONFLICT);
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
    const [totalRows] = await tx
      .select({ total: count() })
      .from(purchaseQuotations);
    return `RFQ-${String((totalRows?.total ?? 0) + 1).padStart(5, '0')}`;
  }
}
