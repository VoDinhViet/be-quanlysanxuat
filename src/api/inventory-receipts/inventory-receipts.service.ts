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
  ne,
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
  InventoryDocumentStatus,
  inventoryReceiptItems,
  inventoryReceipts,
  InventoryReceiptType,
  InventoryReferenceType,
  InventoryTransactionType,
  items,
  productionJobs,
  productionOrders,
  purchaseOrderItems,
  purchaseOrders,
  PurchaseOrderStatus,
  purchaseRequests,
  suppliers,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import {
  onHandQuantityByItemSubquery,
  itemStockColumns,
  jobIssueDemandSubquery,
} from '../inventory/item-stock.query';
import type { InventoryPostingLine } from '../inventory/inventory-posting.service';
import { InventoryPostingService } from '../inventory/inventory-posting.service';
import { IqcService } from '../iqc/iqc.service';
import { getJobQcCoverage } from '../oqc/oqc.query';
import { PaymentRequestsService } from '../payment-requests/payment-requests.service';
import { getReceivedQuantityByPurchaseOrderItemId } from '../purchase-orders/purchase-orders.query';
import { getReturnedQuantityByReceiptItemId } from '../supplier-returns/supplier-returns.query';
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
  /** Phiếu coi như đã `confirm` — `DRAFT` không tính. */
  private static readonly CONFIRMED_STATUSES = [
    InventoryDocumentStatus.PENDING_IQC,
    InventoryDocumentStatus.PENDING_RECEIPT,
    InventoryDocumentStatus.POSTED,
  ];

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly inventoryPostingService: InventoryPostingService,
    private readonly iqcService: IqcService,
    private readonly paymentRequestsService: PaymentRequestsService,
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
      reqDto.productionJobId
        ? eq(inventoryReceipts.productionJobId, reqDto.productionJobId)
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
          productionJob: true,
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
        productionJob: true,
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
    const balance = onHandQuantityByItemSubquery(this.db);
    const demand = jobIssueDemandSubquery(this.db, scope);

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
  ): Promise<void> {
    await this.ensureItemsValid(reqDto.items);
    await this.ensureReferencesValid(reqDto);
    this.ensureProductionJobRequired(
      reqDto.receiptType,
      reqDto.productionJobId,
    );
    await this.ensurePurchaseOrderOrdered(reqDto.purchaseOrderId);
    await this.ensurePurchaseOrderItemsValid(
      reqDto.purchaseOrderId,
      reqDto.items,
    );
    await this.ensureReceiptQuantitiesWithinOrdered(this.db, reqDto.items);

    const { items, ...receiptFields } = reqDto;

    await this.db.transaction(async (tx) => {
      const code = await this.generateReceiptCode(tx, reqDto.receiptDate);

      const [receipt] = await tx
        .insert(inventoryReceipts)
        .values({ ...receiptFields, code, createdBy: userId })
        .returning();

      await this.createItems(tx, receipt.id, items);
    });
  }

  async updateInventoryReceipt(
    receiptId: string,
    reqDto: UpdateInventoryReceiptReqDto,
  ): Promise<void> {
    const receipt = await this.ensureReceiptDraft(receiptId);

    await this.ensureItemsValid(reqDto.items);
    await this.ensureReferencesValid(reqDto);
    this.ensureProductionJobRequired(
      reqDto.receiptType ?? receipt.receiptType,
      reqDto.productionJobId ?? receipt.productionJobId,
    );
    await this.ensurePurchaseOrderOrdered(reqDto.purchaseOrderId);
    await this.ensurePurchaseOrderItemsValid(
      reqDto.purchaseOrderId ?? receipt.purchaseOrderId,
      reqDto.items,
    );
    await this.ensureReceiptQuantitiesWithinOrdered(this.db, reqDto.items);

    const { items, ...receiptFields } = reqDto;

    await this.db.transaction(async (tx) => {
      await tx
        .update(inventoryReceipts)
        .set(receiptFields)
        .where(eq(inventoryReceipts.id, receiptId));

      await this.replaceItems(tx, receiptId, items);
    });
  }

  async deleteInventoryReceipt(receiptId: string): Promise<void> {
    await this.ensureReceiptDraft(receiptId);

    await this.db
      .delete(inventoryReceipts)
      .where(eq(inventoryReceipts.id, receiptId));
  }

  /** `DRAFT → PENDING_RECEIPT`/`PENDING_IQC` — chưa đụng tồn kho. `requiresIqc` sinh một phiếu
   * IQC (`NOT_INSPECTED`) cho mỗi dòng, cùng transaction. Xem
   * `docs/workflows/receipt-confirmation.md`. */
  async confirmInventoryReceipt(
    receiptId: string,
    userId: string,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const receipt = await this.lockReceipt(tx, receiptId);

      if (receipt.status !== InventoryDocumentStatus.DRAFT) {
        throw new AppException(ErrorCode.E098, HttpStatus.CONFLICT);
      }

      const lineItems = await tx.query.inventoryReceiptItems.findMany({
        where: eq(inventoryReceiptItems.receiptId, receiptId),
      });

      if (!lineItems.length) {
        throw new AppException(ErrorCode.E151, HttpStatus.BAD_REQUEST);
      }

      await this.ensureReceiptQuantitiesWithinOrdered(tx, lineItems);

      if (receipt.receiptType === InventoryReceiptType.PRODUCTION) {
        await this.ensureProductionReceiptOqcCleared(tx, receipt, lineItems);
      }

      let status = InventoryDocumentStatus.PENDING_RECEIPT;

      if (receipt.requiresIqc) {
        const supplierId = await this.resolveIqcSupplierId(tx, receipt);

        await this.iqcService.createInspectionsFromReceipt(tx, {
          inventoryReceiptId: receiptId,
          purchaseOrderId: receipt.purchaseOrderId,
          supplierId,
          inspectionDate: new Date(),
          lines: lineItems.map((item) => ({
            itemId: item.itemId,
            quantity: item.quantity,
          })),
          userId,
        });

        status = InventoryDocumentStatus.PENDING_IQC;
      }

      await tx
        .update(inventoryReceipts)
        .set({ status })
        .where(eq(inventoryReceipts.id, receiptId));
    });
  }

  /** `PENDING_RECEIPT`/`PENDING_IQC → POSTED` — sinh bút toán + cập nhật tồn qua
   * `InventoryPostingService`, sau đó phiếu bất biến. `PENDING_IQC` chặn (`E153`) nếu còn phiếu
   * IQC nào chưa `COMPLETED`. Đọc trạng thái nằm trong cùng transaction, sau `lockReceipt`. Trước
   * khi ghi bút toán, `buildReceiptPostingLines` bù trừ SL đã trả NCC (`POSTED`) khỏi từng dòng —
   * hàng NG chưa bao giờ thật sự vào tồn thì không được cộng vào (`docs/workflows/
   * supplier-return.md`). Nếu phiếu gắn PO, gọi `PaymentRequestsService.createIfOrderCompleted`
   * cùng transaction — tự sinh yêu cầu thanh toán khi PO vừa đạt COMPLETED. Xem
   * `docs/workflows/receipt-confirmation.md`. */
  async postInventoryReceipt(receiptId: string, userId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const receipt = await this.lockReceipt(tx, receiptId);

      if (receipt.status === InventoryDocumentStatus.PENDING_IQC) {
        await this.ensureReceiptIqcCompleted(tx, receiptId);
      } else if (receipt.status !== InventoryDocumentStatus.PENDING_RECEIPT) {
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
        lines: await this.buildReceiptPostingLines(tx, receipt, items),
      });

      await tx
        .update(inventoryReceipts)
        .set({
          status: InventoryDocumentStatus.POSTED,
          postedBy: userId,
          postedAt: new Date(),
        })
        .where(eq(inventoryReceipts.id, receiptId));

      if (receipt.purchaseOrderId) {
        await this.paymentRequestsService.createIfOrderCompleted(
          tx,
          receipt.purchaseOrderId,
        );
      }
    });
  }

  /** Bù trừ SL đã trả NCC (`supplier_returns` đã `POSTED`) khỏi từng dòng trước khi ghi bút toán
   * `RECEIPT` — hàng NG bị trả không được cộng vào tồn. Dòng bị bù về 0 thì bỏ hẳn khỏi kết quả
   * (`chk_inventory_transactions_quantity_sign` cấm dòng `RECEIPT` 0/âm). Nhiều dòng cùng `itemId`
   * trên một phiếu → số đã trả trừ dần qua từng dòng theo thứ tự duyệt, không trừ hai lần. Xem
   * `docs/workflows/supplier-return.md`. */
  private async buildReceiptPostingLines(
    tx: DbTransaction,
    receipt: { id: string; receiptType: InventoryReceiptType },
    lineItems: { itemId: string; quantity: number }[],
  ): Promise<InventoryPostingLine[]> {
    const remainingReturnedByItemId = await getReturnedQuantityByReceiptItemId(
      tx,
      receipt.id,
    );

    const lines: InventoryPostingLine[] = [];

    for (const item of lineItems) {
      const remaining = remainingReturnedByItemId.get(item.itemId) ?? 0;
      const netQuantity = Math.max(item.quantity - remaining, 0);
      remainingReturnedByItemId.set(
        item.itemId,
        Math.max(remaining - item.quantity, 0),
      );

      if (netQuantity <= 0) {
        continue;
      }

      lines.push({
        itemId: item.itemId,
        signedQuantity: netQuantity,
        type: receiptTypeTransactionType[receipt.receiptType],
      });
    }

    return lines;
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

    await this.createItems(tx, receiptId, items);
  }

  private async generateReceiptCode(
    tx: DbTransaction,
    receiptDate: Date,
  ): Promise<string> {
    const year = receiptDate.getFullYear();
    const sequence = await generateDocumentSequence(
      tx,
      DocumentType.INVENTORY_RECEIPT,
      year,
    );

    return `PNK-${year}-${String(sequence).padStart(5, '0')}`;
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
    productionJobId?: string;
  }): Promise<void> {
    const [supplier, purchaseRequest, productionOrder, productionJob] =
      await Promise.all([
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
        reqDto.productionJobId
          ? this.db.query.productionJobs.findFirst({
              columns: { id: true },
              where: eq(productionJobs.id, reqDto.productionJobId),
            })
          : Promise.resolve(true),
      ]);

    if (!supplier || !purchaseRequest || !productionOrder || !productionJob) {
      throw new AppException(ErrorCode.E107, HttpStatus.BAD_REQUEST);
    }
  }

  /** `receiptType = PRODUCTION` bắt buộc gắn `productionJobId` (`E179`) — nếu không thì gate nhập
   * kho thành phẩm theo OQC (`docs/domains/inventory.md`) có lỗ hổng bỏ qua hoàn toàn. Đổi hành vi
   * so với thiết kế ban đầu (cột này vốn chỉ để trace, không validate chéo với `receiptType`).
   * `update` truyền vào giá trị **hiệu lực** (payload mới nếu có gửi, giữ nguyên giá trị cũ nếu
   * không) — không tự suy bên trong hàm này. */
  private ensureProductionJobRequired(
    receiptType: InventoryReceiptType,
    productionJobId: string | null | undefined,
  ): void {
    if (receiptType === InventoryReceiptType.PRODUCTION && !productionJobId) {
      throw new AppException(ErrorCode.E179, HttpStatus.BAD_REQUEST);
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

  /** SL cộng dồn mọi phiếu đã `confirm` (`PENDING_IQC`/`PENDING_RECEIPT`/`POSTED`, `DRAFT` không
   * tính vì nháp có thể không bao giờ được xác nhận) trỏ cùng một dòng PO, cộng thêm SL của
   * payload đang xét, không được vượt SL đặt của dòng đó (`E154`). Nhận `Database | DbTransaction`
   * (không bắt buộc `tx` như một write helper thường) vì đây thuần là đọc, và phải dùng được từ cả
   * `create`/`update` (ngoài transaction) lẫn `confirm` (trong transaction) — cùng ngoại lệ với
   * `IqcService.generateIqcCodes`. */
  private async ensureReceiptQuantitiesWithinOrdered(
    db: Database | DbTransaction,
    lineItems: { purchaseOrderItemId?: string | null; quantity: number }[],
  ): Promise<void> {
    const payloadByPoItemId = new Map<string, number>();
    for (const item of lineItems) {
      if (!item.purchaseOrderItemId) {
        continue;
      }
      payloadByPoItemId.set(
        item.purchaseOrderItemId,
        (payloadByPoItemId.get(item.purchaseOrderItemId) ?? 0) + item.quantity,
      );
    }

    if (!payloadByPoItemId.size) {
      return;
    }

    const poItemIds = [...payloadByPoItemId.keys()];

    const [orderedRows, receivedByPoItemId] = await Promise.all([
      db.query.purchaseOrderItems.findMany({
        columns: { id: true, quantity: true },
        where: inArray(purchaseOrderItems.id, poItemIds),
      }),
      getReceivedQuantityByPurchaseOrderItemId(db, {
        purchaseOrderItemIds: poItemIds,
        statuses: InventoryReceiptsService.CONFIRMED_STATUSES,
      }),
    ]);

    const orderedByPoItemId = new Map(
      orderedRows.map((row) => [row.id, row.quantity]),
    );

    for (const [poItemId, payloadQuantity] of payloadByPoItemId) {
      const ordered = orderedByPoItemId.get(poItemId) ?? 0;
      const received = receivedByPoItemId.get(poItemId) ?? 0;
      if (received + payloadQuantity > ordered) {
        throw new AppException(ErrorCode.E154, HttpStatus.BAD_REQUEST);
      }
    }
  }

  /** Gate nhập kho thành phẩm theo QC (`docs/domains/inventory.md`, "Gate nhập kho thành phẩm";
   * `docs/workflows/final-qc.md`) — chỉ chạy khi `receiptType = PRODUCTION`. `productionJobId`
   * NULL tại đây nghĩa là một phiếu cũ tồn tại từ trước ràng buộc này (cột vốn không `NOT NULL` ở
   * DB, chỉ service-enforced) — vẫn chặn bằng `E179` thay vì bỏ qua. Mọi dòng phải cùng `itemId`
   * với Job (`E107`, tái dùng — cùng ngữ nghĩa `inventory_issues` dùng cho `orderItemId` lệch
   * item). Job phải có ≥1 dòng QC (OQC công đoạn `INHOUSE` + IQC công đoạn `OUTSOURCE`, hợp nhất
   * qua `getJobQcCoverage`) và không còn dòng nào chưa `COMPLETED` (`E196`) — không còn so SL như
   * `E180` cũ vì QC giờ ở đơn vị part theo công đoạn, không cùng đơn vị FG của phiếu nhập; công
   * đoạn `OUTSOURCE` chưa từng `requiresIqc` (không có dòng QC nào) không tự nó chặn `E196` — xem
   * comment `getJobQcCoverage` (`E212` cũ đã khai tử, điều kiện của nó nay là tập con của `E196`).
   * Riêng công đoạn Cấp 0 (bước Lắp ráp, node `itemType = 'FG'`) phải có ≥1 phiếu OQC `COMPLETED`
   * (`E209`) — Job chưa từng QC thành phẩm thì không cho nhập, dù mọi dòng QC khác đã xong hết (đó
   * là điều kiện của `E196`, khác điều kiện này); bỏ qua gate này nếu Job không có node Cấp 0 (item
   * không khai routing Cấp 0 — lỗ hổng đã biết, `docs/decisions/oqc-per-operation.md`). SL nhập
   * (cộng dồn mọi phiếu `PRODUCTION` khác đã `confirm` cùng Job, trừ chính phiếu này) vẫn chặn trần
   * theo `production_jobs.quantity` (`E197`). */
  private async ensureProductionReceiptOqcCleared(
    tx: DbTransaction,
    receipt: { id: string; productionJobId: string | null },
    lineItems: { itemId: string; quantity: number }[],
  ): Promise<void> {
    if (!receipt.productionJobId) {
      throw new AppException(ErrorCode.E179, HttpStatus.BAD_REQUEST);
    }

    const job = await tx.query.productionJobs.findFirst({
      columns: { itemId: true, quantity: true },
      where: eq(productionJobs.id, receipt.productionJobId),
    });

    if (!job) {
      throw new AppException(ErrorCode.E082, HttpStatus.NOT_FOUND);
    }

    let thisReceiptQuantity = 0;
    for (const item of lineItems) {
      if (item.itemId !== job.itemId) {
        throw new AppException(ErrorCode.E107, HttpStatus.BAD_REQUEST);
      }
      thisReceiptQuantity += item.quantity;
    }

    const [coverage, receivedSoFar] = await Promise.all([
      getJobQcCoverage(tx, receipt.productionJobId),
      this.getConfirmedProductionQuantityByJobId(
        tx,
        receipt.productionJobId,
        receipt.id,
      ),
    ]);

    if (coverage.total === 0 || coverage.open > 0) {
      throw new AppException(ErrorCode.E196, HttpStatus.BAD_REQUEST);
    }

    if (coverage.hasFinalAssembly && coverage.finalCompleted === 0) {
      throw new AppException(ErrorCode.E209, HttpStatus.BAD_REQUEST);
    }

    if (receivedSoFar + thisReceiptQuantity > job.quantity) {
      throw new AppException(ErrorCode.E197, HttpStatus.BAD_REQUEST);
    }
  }

  /** Σ SL các dòng mọi phiếu nhập `PRODUCTION` khác đã `confirm` (`PENDING_IQC`/`PENDING_RECEIPT`/
   * `POSTED`) cùng Job, loại trừ chính phiếu đang xét — dùng bởi `ensureProductionReceiptOqcCleared`. */
  private async getConfirmedProductionQuantityByJobId(
    tx: DbTransaction,
    productionJobId: string,
    excludeReceiptId: string,
  ): Promise<number> {
    const [row] = await tx
      .select({
        total:
          sql<number>`coalesce(sum(${inventoryReceiptItems.quantity}), 0)`.mapWith(
            Number,
          ),
      })
      .from(inventoryReceiptItems)
      .innerJoin(
        inventoryReceipts,
        eq(inventoryReceipts.id, inventoryReceiptItems.receiptId),
      )
      .where(
        and(
          eq(inventoryReceipts.productionJobId, productionJobId),
          inArray(
            inventoryReceipts.status,
            InventoryReceiptsService.CONFIRMED_STATUSES,
          ),
          ne(inventoryReceipts.id, excludeReceiptId),
        ),
      );

    return row?.total ?? 0;
  }

  /** NCC của phiếu IQC sinh ra khi `confirm` — ưu tiên `receipt.supplierId`, rơi về NCC của PO gắn
   * với phiếu. Không suy được cả hai → `E152` (`chk_qc_requests_incoming_supplier` đòi `supplier_id` khác
   * null cho dòng `kind = INCOMING`). */
  private async resolveIqcSupplierId(
    tx: DbTransaction,
    receipt: { supplierId: string | null; purchaseOrderId: string | null },
  ): Promise<string> {
    if (receipt.supplierId) {
      return receipt.supplierId;
    }

    if (receipt.purchaseOrderId) {
      const purchaseOrder = await tx.query.purchaseOrders.findFirst({
        columns: { supplierId: true },
        where: eq(purchaseOrders.id, receipt.purchaseOrderId),
      });
      if (purchaseOrder?.supplierId) {
        return purchaseOrder.supplierId;
      }
    }

    throw new AppException(ErrorCode.E152, HttpStatus.BAD_REQUEST);
  }

  /** `post` một phiếu `PENDING_IQC` chỉ chạy khi mọi phiếu IQC gắn với nó đã `COMPLETED` — thiếu
   * điều kiện này, kể cả khi chưa có phiếu IQC nào, đều là `E153`. */
  private async ensureReceiptIqcCompleted(
    tx: DbTransaction,
    receiptId: string,
  ): Promise<void> {
    const completed = await this.iqcService.areInspectionsCompletedForReceipt(
      tx,
      receiptId,
    );

    if (!completed) {
      throw new AppException(ErrorCode.E153, HttpStatus.CONFLICT);
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
