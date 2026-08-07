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
  InventoryDocumentStatus,
  inventoryReceiptItems,
  inventoryReceipts,
  InventoryReceiptType,
  InventoryReferenceType,
  InventoryTransactionType,
  items as itemsTable,
  productionOrders,
  purchaseRequests,
  suppliers,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { InventoryPostingService } from '../inventory/inventory-posting.service';
import { WarehousesService } from '../warehouses/warehouses.service';
import { CreateInventoryReceiptReqDto } from './dto/create-inventory-receipt.req.dto';
import { GetInventoryReceiptsReqDto } from './dto/get-inventory-receipts.req.dto';
import { InventoryReceiptItemReqDto } from './dto/inventory-receipt-item.req.dto';
import { InventoryReceiptResDto } from './dto/inventory-receipt.res.dto';
import { UpdateInventoryReceiptReqDto } from './dto/update-inventory-receipt.req.dto';

const RECEIPT_DETAIL_WITH = {
  warehouse: true,
  supplier: true,
  purchaseRequest: true,
  productionOrder: true,
  poster: true,
  creator: true,
  items: { with: { item: true } },
} as const;

/** Loại phiếu → loại bút toán lúc `post` — bảng đầy đủ ở `docs/domains/inventory.md`. */
const RECEIPT_TYPE_TRANSACTION_TYPE: Record<
  InventoryReceiptType,
  InventoryTransactionType
> = {
  [InventoryReceiptType.PURCHASE]: InventoryTransactionType.RECEIPT,
  [InventoryReceiptType.RETURN]: InventoryTransactionType.RECEIPT,
  [InventoryReceiptType.PRODUCTION]: InventoryTransactionType.PRODUCTION_IN,
  [InventoryReceiptType.ADJUSTMENT]: InventoryTransactionType.ADJUSTMENT_IN,
};

@Injectable()
export class InventoryReceiptsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly warehousesService: WarehousesService,
    private readonly inventoryPostingService: InventoryPostingService,
  ) {}

  async getInventoryReceipts(
    reqDto: GetInventoryReceiptsReqDto,
  ): Promise<OffsetPaginatedDto<InventoryReceiptResDto>> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;
    const where = and(
      keyword ? unaccentILike(inventoryReceipts.code, keyword) : undefined,
      reqDto.warehouseId
        ? eq(inventoryReceipts.warehouseId, reqDto.warehouseId)
        : undefined,
      reqDto.receiptType
        ? eq(inventoryReceipts.receiptType, reqDto.receiptType)
        : undefined,
      reqDto.status ? eq(inventoryReceipts.status, reqDto.status) : undefined,
      reqDto.supplierId
        ? eq(inventoryReceipts.supplierId, reqDto.supplierId)
        : undefined,
      reqDto.productionOrderId
        ? eq(inventoryReceipts.productionOrderId, reqDto.productionOrderId)
        : undefined,
      reqDto.fromDate
        ? gte(inventoryReceipts.receiptDate, reqDto.fromDate)
        : undefined,
      // Exclusive next-day boundary — `toDate` parses to midnight UTC, `lte` would drop same-day rows.
      reqDto.toDate
        ? lt(
            inventoryReceipts.receiptDate,
            new Date(reqDto.toDate.getTime() + 24 * 60 * 60 * 1000),
          )
        : undefined,
    );

    const [entities, countRows] = await Promise.all([
      this.db.query.inventoryReceipts.findMany({
        where,
        limit: reqDto.limit,
        offset: reqDto.offset,
        orderBy: [
          desc(inventoryReceipts.receiptDate),
          desc(inventoryReceipts.createdAt),
        ],
        with: RECEIPT_DETAIL_WITH,
      }),
      this.db.select({ total: count() }).from(inventoryReceipts).where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(InventoryReceiptResDto, entities, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(countRows[0]?.total ?? 0, reqDto),
    );
  }

  async getInventoryReceiptDetail(
    receiptId: string,
  ): Promise<InventoryReceiptResDto> {
    const receipt = await this.db.query.inventoryReceipts.findFirst({
      where: eq(inventoryReceipts.id, receiptId),
      with: RECEIPT_DETAIL_WITH,
    });

    if (!receipt) {
      throw new AppException(ErrorCode.E096, HttpStatus.NOT_FOUND);
    }

    return plainToInstance(InventoryReceiptResDto, receipt, {
      excludeExtraneousValues: true,
    });
  }

  async createInventoryReceipt(
    reqDto: CreateInventoryReceiptReqDto,
    userId: string,
  ): Promise<InventoryReceiptResDto> {
    await this.warehousesService.ensureWarehouseActive(reqDto.warehouseId);
    await this.ensureItemsValid(reqDto.items);
    await this.ensureReferencesValid(reqDto);

    let code = reqDto.code;
    if (code) {
      await this.validateCodeUniqueness(code);
    } else {
      code = await this.generateReceiptCode(reqDto.receiptDate);
    }

    const { items, ...receiptFields } = reqDto;

    const receiptId = await this.db.transaction(async (tx) => {
      const [receipt] = await tx
        .insert(inventoryReceipts)
        .values({ ...receiptFields, code, createdBy: userId })
        .returning();

      await this.createItems(tx, receipt.id, items);

      return receipt.id;
    });

    return this.getInventoryReceiptDetail(receiptId);
  }

  async updateInventoryReceipt(
    receiptId: string,
    reqDto: UpdateInventoryReceiptReqDto,
  ): Promise<InventoryReceiptResDto> {
    await this.ensureReceiptDraft(receiptId);

    if (reqDto.items !== undefined) {
      await this.ensureItemsValid(reqDto.items);
    }
    await this.ensureReferencesValid(reqDto);

    const { items, ...receiptFields } = reqDto;

    await this.db.transaction(async (tx) => {
      await tx
        .update(inventoryReceipts)
        .set(receiptFields)
        .where(eq(inventoryReceipts.id, receiptId));

      if (items !== undefined) {
        await this.replaceItems(tx, receiptId, items);
      }
    });

    return this.getInventoryReceiptDetail(receiptId);
  }

  async deleteInventoryReceipt(receiptId: string): Promise<void> {
    await this.ensureReceiptDraft(receiptId);

    await this.db
      .delete(inventoryReceipts)
      .where(eq(inventoryReceipts.id, receiptId));
  }

  /** `DRAFT → POSTED` — sinh bút toán + cập nhật tồn qua `InventoryPostingService`, sau đó phiếu
   * bất biến. Xem `docs/workflows/stock-movement.md`. */
  async postInventoryReceipt(receiptId: string, userId: string): Promise<void> {
    const receipt = await this.ensureReceiptDraft(receiptId);
    const items = await this.db.query.inventoryReceiptItems.findMany({
      where: eq(inventoryReceiptItems.receiptId, receiptId),
    });

    await this.db.transaction(async (tx) => {
      await this.inventoryPostingService.postDocument(tx, {
        warehouseId: receipt.warehouseId,
        referenceType: InventoryReferenceType.INVENTORY_RECEIPT,
        referenceId: receiptId,
        transactionDate: receipt.receiptDate,
        createdBy: userId,
        lines: items.map((item) => ({
          itemId: item.itemId,
          signedQuantity: item.quantity,
          type: RECEIPT_TYPE_TRANSACTION_TYPE[receipt.receiptType],
        })),
      });

      await tx
        .update(inventoryReceipts)
        .set({
          status: InventoryDocumentStatus.POSTED,
          postedBy: userId,
          postedAt: new Date(),
        })
        .where(eq(inventoryReceipts.id, receiptId));
    });
  }

  /** `DRAFT`/`POSTED → CANCELLED`. Từ `POSTED` thì đảo bút toán trước khi đổi trạng thái — xem
   * `InventoryPostingService.reverseDocument`. */
  async cancelInventoryReceipt(
    receiptId: string,
    userId: string,
  ): Promise<void> {
    const receipt = await this.ensureReceiptExists(receiptId);
    if (receipt.status === InventoryDocumentStatus.CANCELLED) {
      throw new AppException(ErrorCode.E098, HttpStatus.CONFLICT);
    }

    if (receipt.status === InventoryDocumentStatus.DRAFT) {
      await this.db
        .update(inventoryReceipts)
        .set({ status: InventoryDocumentStatus.CANCELLED })
        .where(eq(inventoryReceipts.id, receiptId));
      return;
    }

    await this.db.transaction(async (tx) => {
      await this.inventoryPostingService.reverseDocument(tx, {
        referenceType: InventoryReferenceType.INVENTORY_RECEIPT,
        referenceId: receiptId,
        transactionDate: new Date(),
        createdBy: userId,
      });

      await tx
        .update(inventoryReceipts)
        .set({ status: InventoryDocumentStatus.CANCELLED })
        .where(eq(inventoryReceipts.id, receiptId));
    });
  }

  private async createItems(
    tx: DbTransaction,
    receiptId: string,
    items: InventoryReceiptItemReqDto[],
  ): Promise<void> {
    await tx
      .insert(inventoryReceiptItems)
      .values(items.map((item) => ({ ...item, receiptId })));
  }

  private async replaceItems(
    tx: DbTransaction,
    receiptId: string,
    items: InventoryReceiptItemReqDto[],
  ): Promise<void> {
    await tx
      .delete(inventoryReceiptItems)
      .where(eq(inventoryReceiptItems.receiptId, receiptId));

    if (items.length) {
      await this.createItems(tx, receiptId, items);
    }
  }

  private async generateReceiptCode(receiptDate: Date): Promise<string> {
    const year = receiptDate.getFullYear();
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year + 1, 0, 1);
    const [totalRows] = await this.db
      .select({ total: count() })
      .from(inventoryReceipts)
      .where(
        and(
          gte(inventoryReceipts.receiptDate, yearStart),
          lt(inventoryReceipts.receiptDate, yearEnd),
        ),
      );
    return `PNK-${year}-${String((totalRows?.total ?? 0) + 1).padStart(5, '0')}`;
  }

  private async validateCodeUniqueness(code: string): Promise<void> {
    const existing = await this.db.query.inventoryReceipts.findFirst({
      columns: { id: true },
      where: eq(inventoryReceipts.code, code),
    });

    if (existing) {
      throw new AppException(ErrorCode.E097, HttpStatus.CONFLICT);
    }
  }

  /** Mặt hàng của mỗi dòng phải tồn tại (`E100`). Không kiểm loại kho ↔ loại hàng — cố ý, xem
   * `docs/domains/inventory.md`. */
  private async ensureItemsValid(
    lineItems: InventoryReceiptItemReqDto[],
  ): Promise<void> {
    const itemIds = [...new Set(lineItems.map((item) => item.itemId))];

    const found = await this.db.query.items.findMany({
      columns: { id: true },
      where: and(inArray(itemsTable.id, itemIds), isNull(itemsTable.deletedAt)),
    });
    const foundIds = new Set(found.map((item) => item.id));

    for (const item of lineItems) {
      if (!foundIds.has(item.itemId)) {
        throw new AppException(ErrorCode.E100, HttpStatus.NOT_FOUND);
      }
    }
  }

  private async ensureReferencesValid(reqDto: {
    supplierId?: string;
    purchaseRequestId?: string;
    productionOrderId?: string;
  }): Promise<void> {
    const [supplier, purchaseRequest, productionOrder] = await Promise.all([
      reqDto.supplierId
        ? this.db.query.suppliers.findFirst({
            columns: { id: true },
            where: and(
              eq(suppliers.id, reqDto.supplierId),
              isNull(suppliers.deletedAt),
            ),
          })
        : Promise.resolve(true),
      reqDto.purchaseRequestId
        ? this.db.query.purchaseRequests.findFirst({
            columns: { id: true },
            where: eq(purchaseRequests.id, reqDto.purchaseRequestId),
          })
        : Promise.resolve(true),
      reqDto.productionOrderId
        ? this.db.query.productionOrders.findFirst({
            columns: { id: true },
            where: eq(productionOrders.id, reqDto.productionOrderId),
          })
        : Promise.resolve(true),
    ]);

    if (!supplier || !purchaseRequest || !productionOrder) {
      throw new AppException(ErrorCode.E107, HttpStatus.BAD_REQUEST);
    }
  }

  private async ensureReceiptExists(receiptId: string) {
    const existing = await this.db.query.inventoryReceipts.findFirst({
      where: eq(inventoryReceipts.id, receiptId),
    });

    if (!existing) {
      throw new AppException(ErrorCode.E096, HttpStatus.NOT_FOUND);
    }

    return existing;
  }

  private async ensureReceiptDraft(receiptId: string) {
    const receipt = await this.ensureReceiptExists(receiptId);

    if (receipt.status !== InventoryDocumentStatus.DRAFT) {
      throw new AppException(ErrorCode.E098, HttpStatus.CONFLICT);
    }

    return receipt;
  }
}
