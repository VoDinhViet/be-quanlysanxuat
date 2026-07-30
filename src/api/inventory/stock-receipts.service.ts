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
  lte,
  ne,
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
  materials,
  orderItems,
  products,
  ProductType,
  stockReceiptItems,
  stockReceipts,
  StockReceiptReason,
  StockReceiptSubject,
  StockReceiptType,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { CreateStockReceiptReqDto } from './dto/create-stock-receipt.req.dto';
import { GetStockReceiptsReqDto } from './dto/get-stock-receipts.req.dto';
import { StockReceiptItemReqDto } from './dto/stock-receipt-item.req.dto';
import { StockReceiptResDto } from './dto/stock-receipt.res.dto';
import { UpdateStockReceiptReqDto } from './dto/update-stock-receipt.req.dto';

/** Reason values allowed per (subject, type) — mirrors the DB CHECK
 * `chk_stock_receipts_reason_type` (see `stock-receipts.ts`), pre-validated here for a clean
 * `E073` instead of a raw 500. */
const VALID_REASONS: Record<
  StockReceiptSubject,
  Record<StockReceiptType, StockReceiptReason[]>
> = {
  [StockReceiptSubject.FINISHED_GOOD]: {
    [StockReceiptType.IN]: [
      StockReceiptReason.PRODUCTION,
      StockReceiptReason.OPENING,
      StockReceiptReason.STOCKTAKE,
      StockReceiptReason.OTHER,
    ],
    [StockReceiptType.OUT]: [
      StockReceiptReason.DELIVERY,
      StockReceiptReason.STOCKTAKE,
      StockReceiptReason.OTHER,
    ],
  },
  [StockReceiptSubject.MATERIAL]: {
    [StockReceiptType.IN]: [
      StockReceiptReason.PURCHASE,
      StockReceiptReason.OPENING,
      StockReceiptReason.STOCKTAKE,
      StockReceiptReason.OTHER,
    ],
    [StockReceiptType.OUT]: [
      StockReceiptReason.PRODUCTION_ISSUE,
      StockReceiptReason.STOCKTAKE,
      StockReceiptReason.OTHER,
    ],
  },
};

const RECEIPT_DETAIL_WITH = {
  creator: true,
  items: { with: { product: true, material: true } },
} as const;

@Injectable()
export class StockReceiptsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async getStockReceipts(
    reqDto: GetStockReceiptsReqDto,
  ): Promise<OffsetPaginatedDto<StockReceiptResDto>> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;
    const where = and(
      isNull(stockReceipts.deletedAt),
      keyword ? unaccentILike(stockReceipts.code, keyword) : undefined,
      reqDto.subject ? eq(stockReceipts.subject, reqDto.subject) : undefined,
      reqDto.type ? eq(stockReceipts.type, reqDto.type) : undefined,
      reqDto.reason ? eq(stockReceipts.reason, reqDto.reason) : undefined,
      reqDto.fromDate
        ? gte(stockReceipts.receiptDate, reqDto.fromDate)
        : undefined,
      reqDto.toDate ? lte(stockReceipts.receiptDate, reqDto.toDate) : undefined,
      reqDto.productId
        ? exists(
            this.db
              .select({ one: sql`1` })
              .from(stockReceiptItems)
              .where(
                and(
                  eq(stockReceiptItems.receiptId, stockReceipts.id),
                  eq(stockReceiptItems.productId, reqDto.productId),
                ),
              ),
          )
        : undefined,
      reqDto.materialId
        ? exists(
            this.db
              .select({ one: sql`1` })
              .from(stockReceiptItems)
              .where(
                and(
                  eq(stockReceiptItems.receiptId, stockReceipts.id),
                  eq(stockReceiptItems.materialId, reqDto.materialId),
                ),
              ),
          )
        : undefined,
    );

    const [entities, countRows] = await Promise.all([
      this.db.query.stockReceipts.findMany({
        where,
        limit: reqDto.limit,
        offset: reqDto.offset,
        orderBy: [
          desc(stockReceipts.receiptDate),
          desc(stockReceipts.createdAt),
        ],
        with: RECEIPT_DETAIL_WITH,
      }),
      this.db.select({ total: count() }).from(stockReceipts).where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(StockReceiptResDto, entities, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(countRows[0]?.total ?? 0, reqDto),
    );
  }

  async getStockReceiptDetail(receiptId: string): Promise<StockReceiptResDto> {
    const receipt = await this.db.query.stockReceipts.findFirst({
      where: and(
        eq(stockReceipts.id, receiptId),
        isNull(stockReceipts.deletedAt),
      ),
      with: RECEIPT_DETAIL_WITH,
    });

    if (!receipt) {
      throw new AppException(ErrorCode.E067, HttpStatus.NOT_FOUND);
    }

    return plainToInstance(StockReceiptResDto, receipt, {
      excludeExtraneousValues: true,
    });
  }

  async createStockReceipt(
    reqDto: CreateStockReceiptReqDto,
    userId: string,
  ): Promise<StockReceiptResDto> {
    // Every check below is a read, so it runs before the transaction opens — the transaction only
    // has to keep the writes together.
    let code = reqDto.code;
    if (code) {
      await this.validateCodeUniqueness(code);
    } else {
      code = await this.generateReceiptCode(reqDto.subject, reqDto.type);
    }

    this.ensureReasonMatchesSubjectAndType(
      reqDto.subject,
      reqDto.type,
      reqDto.reason,
    );

    if (reqDto.items.length) {
      await this.ensureItemsValid(reqDto.subject, reqDto.type, reqDto.items);
    }
    if (reqDto.type === StockReceiptType.OUT && reqDto.items.length) {
      await this.ensureSufficientStock(reqDto.items);
    }

    const { items, ...receiptFields } = reqDto;

    // The receipt row and its lines must land together — without this transaction a failing line
    // insert would leave a committed receipt with no lines, silently contributing nothing to the
    // ledger it was meant to record.
    const receiptId = await this.db.transaction(async (tx) => {
      const [receipt] = await tx
        .insert(stockReceipts)
        .values({ ...receiptFields, code, createdBy: userId })
        .returning();

      if (items.length) {
        await this.createItems(tx, receipt.id, items);
      }

      return receipt.id;
    });

    return this.getStockReceiptDetail(receiptId);
  }

  async updateStockReceipt(
    receiptId: string,
    reqDto: UpdateStockReceiptReqDto,
  ): Promise<StockReceiptResDto> {
    const existing = await this.ensureReceiptExists(receiptId);
    const effectiveType = reqDto.type ?? existing.type;

    if (reqDto.type || reqDto.reason) {
      this.ensureReasonMatchesSubjectAndType(
        existing.subject,
        effectiveType,
        reqDto.reason ?? existing.reason,
      );
    }

    if (reqDto.items !== undefined && reqDto.items.length) {
      await this.ensureItemsValid(
        existing.subject,
        effectiveType,
        reqDto.items,
      );
    }
    if (
      effectiveType === StockReceiptType.OUT &&
      reqDto.items !== undefined &&
      reqDto.items.length
    ) {
      await this.ensureSufficientStock(reqDto.items, receiptId);
    }

    const { items, ...receiptFields } = reqDto;

    await this.db.transaction(async (tx) => {
      // `updated_at` is bumped by the column's own `$onUpdate`.
      await tx
        .update(stockReceipts)
        .set(receiptFields)
        .where(eq(stockReceipts.id, receiptId));

      if (items !== undefined) {
        await this.replaceItems(tx, receiptId, items);
      }
    });

    return this.getStockReceiptDetail(receiptId);
  }

  /** Soft delete — a receipt is freely deletable, no `orders`-style terminal-status lock. Deleted
   * receipts drop out of every `InventoryService` computation via the `deletedAt IS NULL` filter. */
  async deleteStockReceipt(receiptId: string): Promise<void> {
    await this.ensureReceiptExists(receiptId);

    await this.db
      .update(stockReceipts)
      .set({ deletedAt: new Date() })
      .where(eq(stockReceipts.id, receiptId));
  }

  private async createItems(
    tx: DbTransaction,
    receiptId: string,
    items: StockReceiptItemReqDto[],
  ): Promise<void> {
    await tx
      .insert(stockReceiptItems)
      .values(items.map((item) => ({ ...item, receiptId })));
  }

  /** Replace-all. `tx` is required so a caller cannot accidentally write outside the transaction. */
  private async replaceItems(
    tx: DbTransaction,
    receiptId: string,
    items: StockReceiptItemReqDto[],
  ): Promise<void> {
    await tx
      .delete(stockReceiptItems)
      .where(eq(stockReceiptItems.receiptId, receiptId));

    if (items.length) {
      await this.createItems(tx, receiptId, items);
    }
  }

  /** `PN`/`PX` cho `subject=FINISHED_GOOD`, `PNVT`/`PXVT` cho `subject=MATERIAL` — đếm riêng theo
   * từng cặp (`subject`, `type`) nên hai kho không tranh nhau số thứ tự. */
  private async generateReceiptCode(
    subject: StockReceiptSubject,
    type: StockReceiptType,
  ): Promise<string> {
    const isMaterial = subject === StockReceiptSubject.MATERIAL;
    const prefix =
      type === StockReceiptType.IN
        ? isMaterial
          ? 'PNVT'
          : 'PN'
        : isMaterial
          ? 'PXVT'
          : 'PX';
    const [totalRows] = await this.db
      .select({ total: count() })
      .from(stockReceipts)
      .where(
        and(eq(stockReceipts.subject, subject), eq(stockReceipts.type, type)),
      );
    return `${prefix}${String((totalRows?.total ?? 0) + 1).padStart(4, '0')}`;
  }

  private async validateCodeUniqueness(code: string): Promise<void> {
    const existing = await this.db.query.stockReceipts.findFirst({
      columns: { id: true },
      where: eq(stockReceipts.code, code),
    });

    if (existing) {
      throw new AppException(ErrorCode.E068, HttpStatus.CONFLICT);
    }
  }

  private ensureReasonMatchesSubjectAndType(
    subject: StockReceiptSubject,
    type: StockReceiptType,
    reason: StockReceiptReason,
  ): void {
    if (!VALID_REASONS[subject][type].includes(reason)) {
      throw new AppException(ErrorCode.E073, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Mỗi dòng phải đúng-một-trong `productId`/`materialId`, khớp `subject` của phiếu cha (`E086`)
   * — sau đó rẽ sang bộ kiểm riêng của từng loại. `chk_stock_receipt_items_target` (DB) chỉ đảm
   * bảo "đúng một trong hai", không đảm bảo khớp đúng `subject` vì CHECK không đọc được row cha.
   */
  private async ensureItemsValid(
    subject: StockReceiptSubject,
    type: StockReceiptType,
    items: StockReceiptItemReqDto[],
  ): Promise<void> {
    this.ensureItemsMatchSubject(subject, items);

    if (subject === StockReceiptSubject.MATERIAL) {
      await this.ensureMaterialItemsValid(items);
      return;
    }

    await this.ensureProductItemsValid(type, items);
  }

  private ensureItemsMatchSubject(
    subject: StockReceiptSubject,
    items: StockReceiptItemReqDto[],
  ): void {
    const wantsProduct = subject === StockReceiptSubject.FINISHED_GOOD;

    for (const item of items) {
      const matchesSubject = wantsProduct
        ? item.productId !== undefined && item.materialId === undefined
        : item.materialId !== undefined && item.productId === undefined;

      if (!matchesSubject) {
        throw new AppException(ErrorCode.E086, HttpStatus.BAD_REQUEST);
      }
    }
  }

  /** Every `productId` must exist and be a FINISHED_GOOD (E069/E070); every `orderItemId` (only
   * meaningful on an OUT receipt) must reference a real order line whose own `productId` matches
   * the item's (E072). Checks every line in two round-trips (`inArray`) instead of one per line. */
  private async ensureProductItemsValid(
    type: StockReceiptType,
    items: StockReceiptItemReqDto[],
  ): Promise<void> {
    const productIds = [
      ...new Set(
        items.map((item) => item.productId).filter((id): id is string => !!id),
      ),
    ];
    const foundProducts = await this.db.query.products.findMany({
      columns: { id: true, type: true },
      where: and(inArray(products.id, productIds), isNull(products.deletedAt)),
    });
    const productById = new Map(foundProducts.map((p) => [p.id, p]));

    for (const item of items) {
      const product = item.productId
        ? productById.get(item.productId)
        : undefined;
      if (!product) {
        throw new AppException(ErrorCode.E069, HttpStatus.NOT_FOUND);
      }
      if (product.type !== ProductType.FINISHED_GOOD) {
        throw new AppException(ErrorCode.E070, HttpStatus.BAD_REQUEST);
      }
    }

    const orderItemIds = [
      ...new Set(
        items
          .map((item) => item.orderItemId)
          .filter((id): id is string => !!id),
      ),
    ];

    if (!orderItemIds.length) {
      return;
    }
    if (type !== StockReceiptType.OUT) {
      throw new AppException(ErrorCode.E072, HttpStatus.BAD_REQUEST);
    }

    const foundOrderItems = await this.db.query.orderItems.findMany({
      columns: { id: true, productId: true },
      where: inArray(orderItems.id, orderItemIds),
    });
    const orderItemById = new Map(foundOrderItems.map((oi) => [oi.id, oi]));

    for (const item of items) {
      if (!item.orderItemId) {
        continue;
      }
      const orderItem = orderItemById.get(item.orderItemId);
      if (!orderItem || orderItem.productId !== item.productId) {
        throw new AppException(ErrorCode.E072, HttpStatus.BAD_REQUEST);
      }
    }
  }

  /** Every `materialId` must exist (E085). `orderItemId` has no meaning on a material line — it's
   * the delivery link for a sales order's finished-good demand, so any value here is rejected
   * (E072), regardless of `type`. */
  private async ensureMaterialItemsValid(
    items: StockReceiptItemReqDto[],
  ): Promise<void> {
    const materialIds = [
      ...new Set(
        items.map((item) => item.materialId).filter((id): id is string => !!id),
      ),
    ];
    const foundMaterials = await this.db.query.materials.findMany({
      columns: { id: true },
      where: inArray(materials.id, materialIds),
    });
    const foundIds = new Set(foundMaterials.map((m) => m.id));

    for (const item of items) {
      if (!item.materialId || !foundIds.has(item.materialId)) {
        throw new AppException(ErrorCode.E085, HttpStatus.NOT_FOUND);
      }
      if (item.orderItemId) {
        throw new AppException(ErrorCode.E072, HttpStatus.BAD_REQUEST);
      }
    }
  }

  /**
   * Refuses a write that would drive any product's/material's on-hand quantity below zero. On
   * update, `excludeReceiptId` drops this receipt's own current lines out of the on-hand
   * computation first — since `updateStockReceipt` replaces them wholesale, checking against the
   * ledger *including* the old lines would double-count them. Groups by (productId, materialId)
   * rather than `productId` alone so vật tư cũng được bảo vệ bởi cùng bất biến.
   */
  private async ensureSufficientStock(
    items: StockReceiptItemReqDto[],
    excludeReceiptId?: string,
  ): Promise<void> {
    const requested = new Map<string, number>();
    for (const item of items) {
      const key = this.stockLineKey(item);
      requested.set(key, (requested.get(key) ?? 0) + item.quantity);
    }

    const productIds = items
      .map((item) => item.productId)
      .filter((id): id is string => !!id);
    const materialIds = items
      .map((item) => item.materialId)
      .filter((id): id is string => !!id);

    const onHandRows = await this.db
      .select({
        productId: stockReceiptItems.productId,
        materialId: stockReceiptItems.materialId,
        onHand:
          sql<number>`sum(case when ${stockReceipts.type} = ${StockReceiptType.IN} then ${stockReceiptItems.quantity} else -${stockReceiptItems.quantity} end)`.mapWith(
            Number,
          ),
      })
      .from(stockReceiptItems)
      .innerJoin(
        stockReceipts,
        eq(stockReceipts.id, stockReceiptItems.receiptId),
      )
      .where(
        and(
          isNull(stockReceipts.deletedAt),
          or(
            productIds.length
              ? inArray(stockReceiptItems.productId, productIds)
              : undefined,
            materialIds.length
              ? inArray(stockReceiptItems.materialId, materialIds)
              : undefined,
          ),
          excludeReceiptId
            ? ne(stockReceiptItems.receiptId, excludeReceiptId)
            : undefined,
        ),
      )
      .groupBy(stockReceiptItems.productId, stockReceiptItems.materialId);

    const onHandByKey = new Map(
      onHandRows.map((row) => [this.stockLineKey(row), row.onHand]),
    );

    for (const [key, requestedQty] of requested) {
      const onHand = onHandByKey.get(key) ?? 0;
      if (onHand - requestedQty < 0) {
        throw new AppException(ErrorCode.E071, HttpStatus.CONFLICT);
      }
    }
  }

  /** `productId`/`materialId` là đúng-một-trong-hai trên cùng một dòng, không bao giờ cùng có mặt
   * hay cùng vắng mặt (xem `chk_stock_receipt_items_target`) — gộp thành một khoá duy nhất để
   * `ensureSufficientStock` dùng chung một Map cho cả hai loại tồn. */
  private stockLineKey(item: {
    productId?: string | null;
    materialId?: string | null;
  }): string {
    return item.productId
      ? `product:${item.productId}`
      : `material:${item.materialId}`;
  }

  private async ensureReceiptExists(receiptId: string): Promise<{
    id: string;
    subject: StockReceiptSubject;
    type: StockReceiptType;
    reason: StockReceiptReason;
  }> {
    const existing = await this.db.query.stockReceipts.findFirst({
      columns: { id: true, subject: true, type: true, reason: true },
      where: and(
        eq(stockReceipts.id, receiptId),
        isNull(stockReceipts.deletedAt),
      ),
    });

    if (!existing) {
      throw new AppException(ErrorCode.E067, HttpStatus.NOT_FOUND);
    }

    return existing;
  }
}
