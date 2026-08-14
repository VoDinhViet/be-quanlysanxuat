import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  gte,
  inArray,
  isNull,
  lt,
} from 'drizzle-orm';

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
  items,
  productionOrders,
  purchaseOrderItems,
  purchaseOrders,
  PurchaseOrderStatus,
  purchaseRequests,
  suppliers,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import {
  itemOnHandSubquery,
  itemStockColumns,
  jobMaterialDemandSubquery,
} from '../inventory/item-stock.query';
import { InventoryPostingService } from '../inventory/inventory-posting.service';
import { WarehousesService } from '../warehouses/warehouses.service';
import { CreateInventoryReceiptReqDto } from './dto/create-inventory-receipt.req.dto';
import { GetInventoryReceiptsReqDto } from './dto/get-inventory-receipts.req.dto';
import { InventoryReceiptItemReqDto } from './dto/inventory-receipt-item.req.dto';
import { InventoryReceiptResDto } from './dto/inventory-receipt.res.dto';
import { PageInventoryReceiptResDto } from './dto/page-inventory-receipt.res.dto';
import { UpdateInventoryReceiptReqDto } from './dto/update-inventory-receipt.req.dto';

/** Loại phiếu → loại bút toán lúc `post` — bảng đầy đủ ở `docs/domains/inventory.md`. */
const receiptTypeTransactionType: Record<
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
  ): Promise<OffsetPaginatedDto<PageInventoryReceiptResDto>> {
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
      reqDto.purchaseOrderId
        ? eq(inventoryReceipts.purchaseOrderId, reqDto.purchaseOrderId)
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
        with: {
          warehouse: true,
          supplier: true,
          purchaseRequest: true,
          productionOrder: true,
          purchaseOrder: true,
          posterBy: true,
          creatorBy: true,
          items: { with: { item: true } },
        },
      }),
      this.db.select({ total: count() }).from(inventoryReceipts).where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(PageInventoryReceiptResDto, entities, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(countRows[0]?.total ?? 0, reqDto),
    );
  }

  async getInventoryReceipt(
    receiptId: string,
  ): Promise<InventoryReceiptResDto> {
    const receipt = await this.db.query.inventoryReceipts.findFirst({
      where: eq(inventoryReceipts.id, receiptId),
      with: {
        warehouse: true,
        supplier: true,
        purchaseRequest: true,
        productionOrder: true,
        purchaseOrder: true,
        posterBy: true,
        creatorBy: true,
      },
    });

    if (!receipt) {
      throw new AppException(ErrorCode.E096, HttpStatus.NOT_FOUND);
    }

    const purchaseRequest = receipt.purchaseRequestId
      ? await this.db.query.purchaseRequests.findFirst({
          where: eq(purchaseRequests.id, receipt.purchaseRequestId),
          columns: { productionJobId: true },
        })
      : undefined;

    const lines = await this.getReceiptLines(receiptId, {
      productionJobId: purchaseRequest?.productionJobId,
      productionOrderId: receipt.productionOrderId,
    });

    return plainToInstance(
      InventoryReceiptResDto,
      { ...receipt, items: lines },
      { excludeExtraneousValues: true },
    );
  }

  /** `bomDemand`/`available`/`fromStock` không phải cột thật — relational API không tính được,
   * nên dòng phiếu nhập dùng `.select()` + join thay vì `with: { items: ... }`. Công thức 4 số
   * sống ở `item-stock.query.ts`, dùng chung với `PurchaseRequestsService`. */
  private async getReceiptLines(
    receiptId: string,
    scope: {
      productionJobId?: string | null;
      productionOrderId?: string | null;
    },
  ) {
    const balance = itemOnHandSubquery(this.db);
    const demand = jobMaterialDemandSubquery(this.db, scope);

    return this.db
      .select({
        id: inventoryReceiptItems.id,
        quantity: inventoryReceiptItems.quantity,
        unitPrice: inventoryReceiptItems.unitPrice,
        note: inventoryReceiptItems.note,
        item: getTableColumns(items),
        purchaseOrderItem: getTableColumns(purchaseOrderItems),
        ...itemStockColumns(balance, demand),
      })
      .from(inventoryReceiptItems)
      .innerJoin(items, eq(items.id, inventoryReceiptItems.itemId))
      .leftJoin(
        purchaseOrderItems,
        eq(purchaseOrderItems.id, inventoryReceiptItems.purchaseOrderItemId),
      )
      .leftJoin(balance, eq(balance.itemId, items.id))
      .leftJoin(demand, eq(demand.itemId, items.id))
      .where(eq(inventoryReceiptItems.receiptId, receiptId))
      .orderBy(asc(items.code));
  }

  async createInventoryReceipt(
    reqDto: CreateInventoryReceiptReqDto,
    userId: string,
  ): Promise<InventoryReceiptResDto> {
    await this.warehousesService.ensureWarehouseActive(reqDto.warehouseId);
    await this.ensureItemsValid(reqDto.items);
    await this.ensureReferencesValid(reqDto);
    await this.ensurePurchaseOrderOrdered(reqDto.purchaseOrderId);
    await this.ensurePurchaseOrderItemsValid(
      reqDto.purchaseOrderId,
      reqDto.items,
    );

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

    return this.getInventoryReceipt(receiptId);
  }

  async updateInventoryReceipt(
    receiptId: string,
    reqDto: UpdateInventoryReceiptReqDto,
  ): Promise<InventoryReceiptResDto> {
    const receipt = await this.ensureReceiptDraft(receiptId);

    if (reqDto.items !== undefined) {
      await this.ensureItemsValid(reqDto.items);
    }
    await this.ensureReferencesValid(reqDto);
    await this.ensurePurchaseOrderOrdered(reqDto.purchaseOrderId);

    if (reqDto.items !== undefined) {
      await this.ensurePurchaseOrderItemsValid(
        reqDto.purchaseOrderId ?? receipt.purchaseOrderId,
        reqDto.items,
      );
    }

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

    return this.getInventoryReceipt(receiptId);
  }

  async deleteInventoryReceipt(receiptId: string): Promise<void> {
    await this.ensureReceiptDraft(receiptId);

    await this.db
      .delete(inventoryReceipts)
      .where(eq(inventoryReceipts.id, receiptId));
  }

  /** `DRAFT → POSTED` — sinh bút toán + cập nhật tồn qua `InventoryPostingService`, sau đó phiếu
   * bất biến. Đọc trạng thái nằm trong cùng transaction, sau `lockReceipt`. Xem
   * `docs/workflows/stock-movement.md`. */
  async postInventoryReceipt(receiptId: string, userId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const receipt = await this.lockReceipt(tx, receiptId);

      if (receipt.status !== InventoryDocumentStatus.DRAFT) {
        throw new AppException(ErrorCode.E098, HttpStatus.CONFLICT);
      }

      const items = await tx.query.inventoryReceiptItems.findMany({
        where: eq(inventoryReceiptItems.receiptId, receiptId),
      });

      await this.inventoryPostingService.postDocument(tx, {
        warehouseId: receipt.warehouseId,
        referenceType: InventoryReferenceType.INVENTORY_RECEIPT,
        referenceId: receiptId,
        transactionDate: receipt.receiptDate,
        createdBy: userId,
        lines: items.map((item) => ({
          itemId: item.itemId,
          signedQuantity: item.quantity,
          type: receiptTypeTransactionType[receipt.receiptType],
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
    await this.db.transaction(async (tx) => {
      const receipt = await this.lockReceipt(tx, receiptId);

      if (receipt.status === InventoryDocumentStatus.CANCELLED) {
        throw new AppException(ErrorCode.E098, HttpStatus.CONFLICT);
      }

      if (receipt.status === InventoryDocumentStatus.POSTED) {
        await this.inventoryPostingService.reverseDocument(tx, {
          referenceType: InventoryReferenceType.INVENTORY_RECEIPT,
          referenceId: receiptId,
          transactionDate: new Date(),
          createdBy: userId,
        });
      }

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
      where: and(inArray(items.id, itemIds), isNull(items.deletedAt)),
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

  private async ensurePurchaseOrderOrdered(
    purchaseOrderId?: string,
  ): Promise<void> {
    if (!purchaseOrderId) {
      return;
    }

    const purchaseOrder = await this.db.query.purchaseOrders.findFirst({
      columns: { status: true },
      where: eq(purchaseOrders.id, purchaseOrderId),
    });

    if (!purchaseOrder) {
      throw new AppException(ErrorCode.E121, HttpStatus.NOT_FOUND);
    }
    if (purchaseOrder.status !== PurchaseOrderStatus.ORDERED) {
      throw new AppException(ErrorCode.E145, HttpStatus.BAD_REQUEST);
    }
  }

  /** Dòng có `purchaseOrderItemId` phải thuộc đúng `purchaseOrderId` ở header — thiếu header hoặc
   * lệch PO đều là `E127`. */
  private async ensurePurchaseOrderItemsValid(
    purchaseOrderId: string | null | undefined,
    lineItems: InventoryReceiptItemReqDto[],
  ): Promise<void> {
    const purchaseOrderItemIds = [
      ...new Set(
        lineItems
          .map((item) => item.purchaseOrderItemId)
          .filter((id): id is string => id !== undefined),
      ),
    ];

    if (!purchaseOrderItemIds.length) {
      return;
    }
    if (!purchaseOrderId) {
      throw new AppException(ErrorCode.E127, HttpStatus.BAD_REQUEST);
    }

    const found = await this.db.query.purchaseOrderItems.findMany({
      columns: { id: true, purchaseOrderId: true },
      where: inArray(purchaseOrderItems.id, purchaseOrderItemIds),
    });
    const foundById = new Map(found.map((item) => [item.id, item]));

    for (const id of purchaseOrderItemIds) {
      const match = foundById.get(id);
      if (!match) {
        throw new AppException(ErrorCode.E123, HttpStatus.NOT_FOUND);
      }
      if (match.purchaseOrderId !== purchaseOrderId) {
        throw new AppException(ErrorCode.E127, HttpStatus.BAD_REQUEST);
      }
    }
  }

  /** Khoá dòng phiếu (`FOR UPDATE`) rồi trả về — chỉ gọi bên trong transaction, bằng chính `tx`,
   * vì khoá nhả ngay khi transaction kết thúc. Nhờ đó hai lệnh `post`/`cancel` gọi trùng lên cùng
   * phiếu không cùng lọt qua kiểm trạng thái và cộng tồn hai lần. */
  private async lockReceipt(tx: DbTransaction, receiptId: string) {
    const [receipt] = await tx
      .select()
      .from(inventoryReceipts)
      .where(eq(inventoryReceipts.id, receiptId))
      .for('update');

    if (!receipt) {
      throw new AppException(ErrorCode.E096, HttpStatus.NOT_FOUND);
    }

    return receipt;
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
