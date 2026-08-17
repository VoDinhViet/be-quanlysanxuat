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
  InventoryDocumentStatus,
  InventoryReferenceType,
  InventoryTransactionType,
  iqcInspections,
  items,
  outsourcingOrderItems,
  outsourcingOrders,
  type OutsourcingReceiptItemSelect,
  outsourcingReceiptItems,
  outsourcingReceipts,
  productionJobs,
  suppliers,
  units,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { InventoryPostingService } from '../inventory/inventory-posting.service';
import { IqcService } from '../iqc/iqc.service';
import { WarehousesService } from '../warehouses/warehouses.service';
import { CreateOutsourcingReceiptReqDto } from './dto/create-outsourcing-receipt.req.dto';
import { GetOutsourcingReceiptsReqDto } from './dto/get-outsourcing-receipts.req.dto';
import { GetPendingOrderItemsReqDto } from './dto/get-pending-order-items.req.dto';
import { OutsourcingReceiptItemReqDto } from './dto/outsourcing-receipt-item.req.dto';
import { OutsourcingReceiptResDto } from './dto/outsourcing-receipt.res.dto';
import { PageOutsourcingReceiptResDto } from './dto/page-outsourcing-receipt.res.dto';
import { PendingOrderItemResDto } from './dto/pending-order-item.res.dto';
import { OutsourcingReceiptProgress } from './outsourcing-receipts.constant';
import {
  getReceiptIdsWithPendingIqc,
  getReceivedQuantityByOrderItemIds,
} from './outsourcing-receipts.query';
import type {
  OutsourcingOrderItemWithOrder,
  OutsourcingReceiptDetail,
} from './types/outsourcing-receipt-detail.type';

type ResolvedReceiptItem = {
  outsourcingOrderItemId: string;
  itemId: string;
  quantity: number;
  weight: number | null;
  area: number | null;
  note: string | null;
};

@Injectable()
export class OutsourcingReceiptsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly warehousesService: WarehousesService,
    private readonly inventoryPostingService: InventoryPostingService,
    private readonly iqcService: IqcService,
  ) {}

  async getOutsourcingReceipts(
    reqDto: GetOutsourcingReceiptsReqDto,
  ): Promise<OffsetPaginatedDto<PageOutsourcingReceiptResDto>> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;
    const materialKeyword = reqDto.materialKeyword
      ? `%${reqDto.materialKeyword}%`
      : undefined;

    const where = and(
      keyword ? unaccentILike(outsourcingReceipts.code, keyword) : undefined,
      reqDto.outsourcingOrderId
        ? exists(
            this.db
              .select({ one: sql`1` })
              .from(outsourcingReceiptItems)
              .innerJoin(
                outsourcingOrderItems,
                eq(
                  outsourcingOrderItems.id,
                  outsourcingReceiptItems.outsourcingOrderItemId,
                ),
              )
              .where(
                and(
                  eq(
                    outsourcingReceiptItems.outsourcingReceiptId,
                    outsourcingReceipts.id,
                  ),
                  eq(
                    outsourcingOrderItems.outsourcingOrderId,
                    reqDto.outsourcingOrderId,
                  ),
                ),
              ),
          )
        : undefined,
      reqDto.supplierId
        ? eq(outsourcingReceipts.supplierId, reqDto.supplierId)
        : undefined,
      reqDto.warehouseId
        ? eq(outsourcingReceipts.warehouseId, reqDto.warehouseId)
        : undefined,
      reqDto.status ? eq(outsourcingReceipts.status, reqDto.status) : undefined,
      reqDto.requiresIqc !== undefined
        ? eq(outsourcingReceipts.requiresIqc, reqDto.requiresIqc)
        : undefined,
      materialKeyword
        ? exists(
            this.db
              .select({ one: sql`1` })
              .from(outsourcingReceiptItems)
              .innerJoin(items, eq(items.id, outsourcingReceiptItems.itemId))
              .where(
                and(
                  eq(
                    outsourcingReceiptItems.outsourcingReceiptId,
                    outsourcingReceipts.id,
                  ),
                  or(
                    unaccentILike(items.name, materialKeyword),
                    unaccentILike(items.code, materialKeyword),
                  ),
                ),
              ),
          )
        : undefined,
      reqDto.fromDate
        ? gte(outsourcingReceipts.receiptDate, reqDto.fromDate)
        : undefined,
      reqDto.toDate
        ? lt(
            outsourcingReceipts.receiptDate,
            new Date(reqDto.toDate.getTime() + 24 * 60 * 60 * 1000),
          )
        : undefined,
    );

    const [entities, countRows] = await Promise.all([
      this.db.query.outsourcingReceipts.findMany({
        where,
        limit: reqDto.limit,
        offset: reqDto.offset,
        orderBy: desc(outsourcingReceipts.createdAt),
        with: {
          supplier: true,
          warehouse: true,
          creatorBy: true,
          items: {
            orderBy: asc(outsourcingReceiptItems.sortOrder),
            with: {
              item: { with: { unit: true } },
              outsourcingOrderItem: { with: { outsourcingOrder: true } },
            },
          },
        },
      }),
      this.db.select({ total: count() }).from(outsourcingReceipts).where(where),
    ]);

    // Cast tường minh — nesting `items -> item -> unit` + `items -> outsourcingOrderItem ->
    // outsourcingOrder` vượt độ sâu suy kiểu an toàn của Drizzle (`.claude/rules/service.md`).
    const rows = await this.attachProgress(
      entities as OutsourcingReceiptDetail[],
    );

    return new OffsetPaginatedDto(
      plainToInstance(PageOutsourcingReceiptResDto, rows, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(countRows[0]?.total ?? 0, reqDto),
    );
  }

  async getOutsourcingReceipt(
    outsourcingReceiptId: string,
  ): Promise<OutsourcingReceiptResDto> {
    const row = await this.db.query.outsourcingReceipts.findFirst({
      where: eq(outsourcingReceipts.id, outsourcingReceiptId),
      with: {
        supplier: true,
        warehouse: true,
        creatorBy: true,
        posterBy: true,
        items: {
          orderBy: asc(outsourcingReceiptItems.sortOrder),
          with: {
            item: { with: { unit: true } },
            outsourcingOrderItem: { with: { outsourcingOrder: true } },
          },
        },
      },
    });

    if (!row) {
      throw new AppException(ErrorCode.E170, HttpStatus.NOT_FOUND);
    }

    const [mapped] = await this.attachProgress([
      row as OutsourcingReceiptDetail,
    ]);

    return plainToInstance(OutsourcingReceiptResDto, mapped, {
      excludeExtraneousValues: true,
    });
  }

  async getPendingOrderItems(
    reqDto: GetPendingOrderItemsReqDto,
  ): Promise<OffsetPaginatedDto<PendingOrderItemResDto>> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;

    const where = and(
      eq(outsourcingOrders.status, InventoryDocumentStatus.POSTED),
      reqDto.operationId
        ? eq(outsourcingOrderItems.operationId, reqDto.operationId)
        : undefined,
      keyword
        ? or(
            unaccentILike(outsourcingOrderItems.operationCode, keyword),
            unaccentILike(outsourcingOrderItems.operationName, keyword),
            unaccentILike(outsourcingOrders.code, keyword),
          )
        : undefined,
    );

    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select({
          id: outsourcingOrderItems.id,
          outsourcingOrder: getTableColumns(outsourcingOrders),
          supplier: getTableColumns(suppliers),
          jobCode: productionJobs.code,
          item: getTableColumns(items),
          unit: getTableColumns(units),
          operationCode: outsourcingOrderItems.operationCode,
          operationName: outsourcingOrderItems.operationName,
          quantity: outsourcingOrderItems.quantity,
          weight: outsourcingOrderItems.weight,
          area: outsourcingOrderItems.area,
        })
        .from(outsourcingOrderItems)
        .innerJoin(
          outsourcingOrders,
          eq(outsourcingOrders.id, outsourcingOrderItems.outsourcingOrderId),
        )
        .innerJoin(suppliers, eq(suppliers.id, outsourcingOrders.supplierId))
        .leftJoin(
          productionJobs,
          eq(productionJobs.id, outsourcingOrderItems.productionJobId),
        )
        .innerJoin(items, eq(items.id, outsourcingOrderItems.itemId))
        .innerJoin(units, eq(units.id, items.unitId))
        .where(where)
        .orderBy(desc(outsourcingOrderItems.createdAt))
        .limit(reqDto.limit)
        .offset(reqDto.offset),
      this.db
        .select({ total: count() })
        .from(outsourcingOrderItems)
        .innerJoin(
          outsourcingOrders,
          eq(outsourcingOrders.id, outsourcingOrderItems.outsourcingOrderId),
        )
        .where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(PendingOrderItemResDto, rows, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(total, reqDto),
    );
  }

  /** Không còn nháp — tạo là nhận luôn: resolve/validate xong thì `INSERT` header thẳng `POSTED` và
   * cộng tồn trong cùng transaction (gộp logic `post` cũ), sinh IQC nếu `requiresIqc` ngay sau đó.
   * `excludeReceiptId: receipt.id` ở `ensurePersistedItemsWithinOrdered` bắt buộc phải giữ — cùng lý
   * do `excludeOrderId` ở `OutsourcingOrdersService.createOutsourcingOrder`. */
  async createOutsourcingReceipt(
    reqDto: CreateOutsourcingReceiptReqDto,
    userId: string,
  ): Promise<void> {
    await this.warehousesService.ensureWarehouseActive(reqDto.warehouseId);

    const resolvedItems = await this.resolveAndValidateItems(
      reqDto.items,
      reqDto.supplierId,
    );

    const code = await this.generateOutsourcingReceiptCode();
    const { items: _items, ...receiptFields } = reqDto;

    await this.db.transaction(async (tx) => {
      const [receipt] = await tx
        .insert(outsourcingReceipts)
        .values({
          ...receiptFields,
          code,
          createdBy: userId,
          status: InventoryDocumentStatus.POSTED,
          postedBy: userId,
          postedAt: new Date(),
        })
        .returning();

      const lineItems = await tx
        .insert(outsourcingReceiptItems)
        .values(
          resolvedItems.map((item, index) => ({
            ...item,
            outsourcingReceiptId: receipt.id,
            sortOrder: index,
          })),
        )
        .returning();

      await this.ensurePersistedItemsWithinOrdered(tx, receipt.id, lineItems);

      await this.inventoryPostingService.postDocument(tx, {
        warehouseId: receipt.warehouseId,
        referenceType: InventoryReferenceType.OUTSOURCING_RECEIPT,
        referenceId: receipt.id,
        transactionDate: receipt.receiptDate,
        createdBy: userId,
        lines: lineItems.map((item) => ({
          itemId: item.itemId,
          // Nhận về luôn cộng tồn — dấu dương.
          signedQuantity: item.quantity,
          type: InventoryTransactionType.RECEIPT,
        })),
      });

      // Hàng đã về kho vật lý ở bước trên rồi — sinh IQC ở đây không gate việc `create`, khác nhánh
      // IQC của phiếu nhập mua (`confirm` mới là nơi gate, `.claude/rules/service.md`).
      if (receipt.requiresIqc && lineItems.length) {
        await this.iqcService.createInspectionsFromOutsourcingReceipt(tx, {
          outsourcingReceiptId: receipt.id,
          supplierId: receipt.supplierId,
          inspectionDate: new Date(),
          lines: lineItems.map((item) => ({
            itemId: item.itemId,
            quantity: item.quantity,
          })),
          userId,
        });
      }
    });
  }

  async cancelOutsourcingReceipt(
    outsourcingReceiptId: string,
    userId: string,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const row = await this.lockOutsourcingReceipt(tx, outsourcingReceiptId);

      if (row.status === InventoryDocumentStatus.CANCELLED) {
        throw new AppException(ErrorCode.E098, HttpStatus.CONFLICT);
      }

      if (row.status === InventoryDocumentStatus.POSTED) {
        const hasLinkedIqc = await this.hasLinkedIqc(tx, outsourcingReceiptId);
        if (hasLinkedIqc) {
          throw new AppException(ErrorCode.E173, HttpStatus.CONFLICT);
        }

        await this.inventoryPostingService.reverseDocument(tx, {
          referenceType: InventoryReferenceType.OUTSOURCING_RECEIPT,
          referenceId: outsourcingReceiptId,
          transactionDate: new Date(),
          createdBy: userId,
        });
      }

      await tx
        .update(outsourcingReceipts)
        .set({ status: InventoryDocumentStatus.CANCELLED })
        .where(eq(outsourcingReceipts.id, outsourcingReceiptId));
    });
  }

  /** Tính `totalQuantity` + `progress` cho danh sách phiếu — `progress` không tính được bằng SQL
   * phẳng (phụ thuộc SL còn lại của TỪNG dòng OS-OUT mà phiếu chạm tới, xem
   * `outsourcing-receipts.constant.ts`) nên gộp theo lô: 1 lượt `getReceivedQuantityByOrderItemIds`
   * + 1 lượt `getReceiptIdsWithPendingIqc` cho cả trang, không lặp lại theo từng phiếu. */
  private async attachProgress(entities: OutsourcingReceiptDetail[]): Promise<
    (OutsourcingReceiptDetail & {
      totalQuantity: number;
      progress: OutsourcingReceiptProgress;
    })[]
  > {
    const orderItemIds = [
      ...new Set(
        entities.flatMap((entity) =>
          entity.items.map((item) => item.outsourcingOrderItem.id),
        ),
      ),
    ];
    const [receivedByOrderItemId, pendingIqcReceiptIds] = await Promise.all([
      getReceivedQuantityByOrderItemIds(this.db, {
        orderItemIds,
        statuses: [InventoryDocumentStatus.POSTED],
      }),
      getReceiptIdsWithPendingIqc(
        this.db,
        entities.map((entity) => entity.id),
      ),
    ]);

    return entities.map((entity) => {
      const totalQuantity = entity.items.reduce(
        (sum, item) => sum + item.quantity,
        0,
      );
      const progress = this.resolveReceiptProgress(
        entity,
        receivedByOrderItemId,
        pendingIqcReceiptIds,
      );
      return { ...entity, totalQuantity, progress };
    });
  }

  private resolveReceiptProgress(
    entity: OutsourcingReceiptDetail,
    receivedByOrderItemId: Map<string, number>,
    pendingIqcReceiptIds: Set<string>,
  ): OutsourcingReceiptProgress {
    if (entity.status === InventoryDocumentStatus.CANCELLED) {
      return OutsourcingReceiptProgress.CANCELLED;
    }
    if (entity.status === InventoryDocumentStatus.DRAFT) {
      return OutsourcingReceiptProgress.DRAFT;
    }
    if (entity.requiresIqc && pendingIqcReceiptIds.has(entity.id)) {
      return OutsourcingReceiptProgress.WAITING_QC;
    }
    const allOrderLinesComplete = entity.items.every((item) => {
      const received =
        receivedByOrderItemId.get(item.outsourcingOrderItem.id) ?? 0;
      return received >= item.outsourcingOrderItem.quantity;
    });
    return allOrderLinesComplete
      ? OutsourcingReceiptProgress.COMPLETED
      : OutsourcingReceiptProgress.PARTIAL;
  }

  /** Resolve + validate toàn bộ dòng của payload create: rỗng (`E185`), trùng dòng OS-OUT nguồn
   * (`E186`), rồi từng dòng: OS-OUT nguồn tồn tại + `POSTED` (`E165`/`E171`), NCC khớp header
   * (`E187`), chặn nhận vượt SL gửi của dòng (`E172`, tính trên `POSTED` — không còn phiếu nào ở
   * `DRAFT` để cộng dồn). `weight`/`area` mặc định copy từ dòng OS-OUT khi client không gửi. Đây là
   * lượt kiểm mềm, chạy trước khi phiếu tồn tại; `ensurePersistedItemsWithinOrdered` mới là chốt
   * chặn thật trên dữ liệu sống. */
  private async resolveAndValidateItems(
    reqItems: OutsourcingReceiptItemReqDto[],
    supplierId: string,
  ): Promise<ResolvedReceiptItem[]> {
    if (!reqItems.length) {
      throw new AppException(ErrorCode.E185, HttpStatus.BAD_REQUEST);
    }

    const orderItemIds = reqItems.map((item) => item.outsourcingOrderItemId);
    if (new Set(orderItemIds).size !== orderItemIds.length) {
      throw new AppException(ErrorCode.E186, HttpStatus.BAD_REQUEST);
    }

    const orderItems = (await this.db.query.outsourcingOrderItems.findMany({
      where: inArray(outsourcingOrderItems.id, orderItemIds),
      with: { outsourcingOrder: true },
    })) as OutsourcingOrderItemWithOrder[];
    const orderItemById = new Map(orderItems.map((row) => [row.id, row]));

    for (const orderItemId of orderItemIds) {
      const orderItem = orderItemById.get(orderItemId);
      // Không tìm thấy dòng OS-OUT nguồn — tái dùng `E165` (không tìm thấy OS-OUT), cùng aggregate.
      if (!orderItem) {
        throw new AppException(ErrorCode.E165, HttpStatus.NOT_FOUND);
      }
      if (
        orderItem.outsourcingOrder.status !== InventoryDocumentStatus.POSTED
      ) {
        throw new AppException(ErrorCode.E171, HttpStatus.CONFLICT);
      }
      if (orderItem.outsourcingOrder.supplierId !== supplierId) {
        throw new AppException(ErrorCode.E187, HttpStatus.BAD_REQUEST);
      }
    }

    const receivedMap = await getReceivedQuantityByOrderItemIds(this.db, {
      orderItemIds,
      statuses: [InventoryDocumentStatus.POSTED],
    });

    return reqItems.map((item) => {
      const orderItem = orderItemById.get(item.outsourcingOrderItemId)!;
      const receivedSoFar = receivedMap.get(item.outsourcingOrderItemId) ?? 0;

      if (receivedSoFar + item.quantity > orderItem.quantity) {
        throw new AppException(ErrorCode.E172, HttpStatus.BAD_REQUEST);
      }

      return {
        outsourcingOrderItemId: item.outsourcingOrderItemId,
        itemId: orderItem.itemId,
        quantity: item.quantity,
        weight: item.weight ?? orderItem.weight,
        area: item.area ?? orderItem.area,
        note: item.note ?? null,
      };
    });
  }

  /** Chốt chặn thật của `E172`, chạy trong transaction `create` trên dữ liệu vừa insert — khác lượt
   * kiểm mềm ở `resolveAndValidateItems` (chạy trước khi phiếu tồn tại). `excludeReceiptId` bắt buộc
   * phải truyền = chính phiếu đang tạo — header đã `INSERT` với `POSTED` ngay trong transaction này
   * nên `tx` nhìn thấy chính dòng của nó, không loại sẽ bị cộng dồn hai lần vào `receivedMap`. */
  private async ensurePersistedItemsWithinOrdered(
    tx: DbTransaction,
    outsourcingReceiptId: string,
    lineItems: OutsourcingReceiptItemSelect[],
  ): Promise<void> {
    if (!lineItems.length) {
      return;
    }

    const orderItemIds = lineItems.map((item) => item.outsourcingOrderItemId);
    const orderItems = await tx.query.outsourcingOrderItems.findMany({
      where: inArray(outsourcingOrderItems.id, orderItemIds),
      columns: { id: true, quantity: true },
    });
    const orderItemById = new Map(orderItems.map((row) => [row.id, row]));

    const receivedMap = await getReceivedQuantityByOrderItemIds(tx, {
      orderItemIds,
      statuses: [InventoryDocumentStatus.POSTED],
      excludeReceiptId: outsourcingReceiptId,
    });

    for (const item of lineItems) {
      const orderItem = orderItemById.get(item.outsourcingOrderItemId);
      if (!orderItem) {
        continue;
      }
      const receivedSoFar = receivedMap.get(item.outsourcingOrderItemId) ?? 0;

      if (receivedSoFar + item.quantity > orderItem.quantity) {
        throw new AppException(ErrorCode.E172, HttpStatus.BAD_REQUEST);
      }
    }
  }

  /** Huỷ OS-IN đã `POSTED` bị chặn (`E173`) nếu đã sinh `iqc_inspections` trỏ vào — cùng lý do
   * `supplier_returns` chưa có `cancel`: cần đường "un-complete" IQC. Chặn bất kể trạng thái IQC
   * (kể cả đã `COMPLETED`) — khác `getReceiptIdsWithPendingIqc`, chỉ khớp IQC chưa `COMPLETED`. */
  private async hasLinkedIqc(
    tx: DbTransaction,
    outsourcingReceiptId: string,
  ): Promise<boolean> {
    const existing = await tx.query.iqcInspections.findFirst({
      columns: { id: true },
      where: eq(iqcInspections.outsourcingReceiptId, outsourcingReceiptId),
    });

    return !!existing;
  }

  private async lockOutsourcingReceipt(
    tx: DbTransaction,
    outsourcingReceiptId: string,
  ) {
    const [row] = await tx
      .select()
      .from(outsourcingReceipts)
      .where(eq(outsourcingReceipts.id, outsourcingReceiptId))
      .for('update');

    if (!row) {
      throw new AppException(ErrorCode.E170, HttpStatus.NOT_FOUND);
    }

    return row;
  }

  private async generateOutsourcingReceiptCode(): Promise<string> {
    const [totalRows] = await this.db
      .select({ total: count() })
      .from(outsourcingReceipts);
    return `OS-IN-${String((totalRows?.total ?? 0) + 1).padStart(4, '0')}`;
  }
}
