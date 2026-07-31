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

/** Giá trị `reason` hợp lệ theo từng (subject, type) — khớp CHECK `chk_stock_receipts_reason_type`
 * (xem `stock-receipts.ts`), validate trước ở đây để trả `E073` sạch thay vì 500 thô. */
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

    // Phiếu và các dòng phải vào cùng lúc — nếu không, insert dòng lỗi sẽ để lại một phiếu đã
    // commit nhưng không dòng nào, âm thầm không đóng góp gì vào sổ kho.
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

    // Validate lại cặp (type, reason) khi một trong hai đổi — kể cả khi chỉ gửi một field, so với
    // giá trị hiệu lực của field còn lại (giống (type, clientId) ở `MaterialsService.updateMaterial`).
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

  /** Bản ghi xoá mềm rớt khỏi mọi tính toán của `InventoryService` qua filter `deletedAt IS NULL`. */
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

  /** Replace-all. Bắt buộc truyền `tx` để tránh ghi ra ngoài transaction. */
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

  /** `productId` phải là FINISHED_GOOD tồn tại; `orderItemId` (chỉ có nghĩa trên phiếu OUT) phải
   * khớp đúng `productId` của dòng đơn hàng đó. */
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

  /** `materialId` phải tồn tại (`E085`). `orderItemId` vô nghĩa trên dòng vật tư — đó là liên kết
   * giao hàng cho nhu cầu thành phẩm, nên có giá trị là bị từ chối (`E072`), bất kể `type`. */
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

  /** Từ chối write nào kéo tồn (thành phẩm/vật tư) xuống dưới 0. Lúc update, `excludeReceiptId`
   * loại các dòng hiện tại của chính phiếu này khỏi phép tính trước — vì `updateStockReceipt`
   * thay hết dòng, tính cả dòng cũ sẽ đếm trùng. Gộp theo (productId, materialId) để vật tư cũng
   * được bảo vệ bởi cùng bất biến. */
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

  /** Gộp `productId`/`materialId` thành một khoá — `ensureSufficientStock` dùng chung một Map cho
   * cả hai loại tồn. */
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
