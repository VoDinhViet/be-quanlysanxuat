import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { and, count, desc, eq, gte, inArray, isNull, lt } from 'drizzle-orm';

import { OffsetPaginationDto } from '../../common/dto/offset-pagination/offset-pagination.dto';
import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import {
  DocumentType,
  generateDocumentSequence,
} from '../../common/utils/document-sequence.util';
import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import type { Database, DbTransaction } from '../../database/database.type';
import {
  InventoryAdjustmentType,
  InventoryDocumentStatus,
  InventoryReferenceType,
  InventoryTransactionType,
  inventoryAdjustmentItems,
  inventoryAdjustments,
  items,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { InventoryPostingService } from '../inventory/inventory-posting.service';
import { CreateInventoryAdjustmentReqDto } from './dto/create-inventory-adjustment.req.dto';
import { GetInventoryAdjustmentsReqDto } from './dto/get-inventory-adjustments.req.dto';
import { InventoryAdjustmentItemReqDto } from './dto/inventory-adjustment-item.req.dto';
import { InventoryAdjustmentResDto } from './dto/inventory-adjustment.res.dto';
import { PageInventoryAdjustmentResDto } from './dto/page-inventory-adjustment.res.dto';
import { UpdateInventoryAdjustmentReqDto } from './dto/update-inventory-adjustment.req.dto';

/** Loại điều chỉnh → loại bút toán lúc `post`. */
const adjustmentTypeTransactionType: Record<
  InventoryAdjustmentType,
  InventoryTransactionType
> = {
  [InventoryAdjustmentType.INCREASE]: InventoryTransactionType.ADJUSTMENT_IN,
  [InventoryAdjustmentType.DECREASE]: InventoryTransactionType.ADJUSTMENT_OUT,
};

@Injectable()
export class InventoryAdjustmentsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly inventoryPostingService: InventoryPostingService,
  ) {}

  async getInventoryAdjustments(
    reqDto: GetInventoryAdjustmentsReqDto,
  ): Promise<OffsetPaginatedDto<PageInventoryAdjustmentResDto>> {
    const where = and(
      reqDto.adjustmentType
        ? eq(inventoryAdjustments.adjustmentType, reqDto.adjustmentType)
        : undefined,
      reqDto.reason
        ? eq(inventoryAdjustments.reason, reqDto.reason)
        : undefined,
      reqDto.status
        ? eq(inventoryAdjustments.status, reqDto.status)
        : undefined,
      reqDto.startDate
        ? gte(inventoryAdjustments.adjustmentDate, reqDto.startDate)
        : undefined,
      // Exclusive next-day boundary — `endDate` parses to midnight UTC, `lte` would drop same-day rows.
      reqDto.endDate
        ? lt(
            inventoryAdjustments.adjustmentDate,
            new Date(reqDto.endDate.getTime() + 24 * 60 * 60 * 1000),
          )
        : undefined,
    );

    const [entities, countRows] = await Promise.all([
      this.db.query.inventoryAdjustments.findMany({
        where,
        limit: reqDto.limit,
        offset: reqDto.offset,
        orderBy: [
          desc(inventoryAdjustments.adjustmentDate),
          desc(inventoryAdjustments.createdAt),
        ],
        with: {
          items: { with: { item: true, unit: true } },
          creatorBy: true,
        },
      }),
      this.db
        .select({ total: count() })
        .from(inventoryAdjustments)
        .where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(PageInventoryAdjustmentResDto, entities, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(countRows[0]?.total ?? 0, reqDto),
    );
  }

  async getInventoryAdjustment(
    adjustmentId: string,
  ): Promise<InventoryAdjustmentResDto> {
    const inventoryAdjustment =
      await this.db.query.inventoryAdjustments.findFirst({
        where: eq(inventoryAdjustments.id, adjustmentId),
        with: {
          items: { with: { item: true, unit: true } },
          posterBy: true,
          creatorBy: true,
        },
      });

    if (!inventoryAdjustment) {
      throw new AppException(ErrorCode.E096, HttpStatus.NOT_FOUND);
    }

    return plainToInstance(InventoryAdjustmentResDto, inventoryAdjustment, {
      excludeExtraneousValues: true,
    });
  }

  async createInventoryAdjustment(
    reqDto: CreateInventoryAdjustmentReqDto,
    userId: string,
  ): Promise<void> {
    const baseUnitByItemId = await this.ensureItemsValid(reqDto.items);

    const { items: itemsToCreate, ...adjustmentFields } = reqDto;

    await this.db.transaction(async (tx) => {
      const code = await this.generateAdjustmentCode(tx, reqDto.adjustmentDate);

      const [inventoryAdjustment] = await tx
        .insert(inventoryAdjustments)
        .values({ ...adjustmentFields, code, createdBy: userId })
        .returning();

      await this.createAdjustmentItems(
        tx,
        inventoryAdjustment.id,
        itemsToCreate,
        baseUnitByItemId,
      );
    });
  }

  async updateInventoryAdjustment(
    adjustmentId: string,
    reqDto: UpdateInventoryAdjustmentReqDto,
  ): Promise<void> {
    await this.ensureAdjustmentDraft(adjustmentId);

    const baseUnitByItemId = await this.ensureItemsValid(reqDto.items);

    const { items: itemsToReplace, ...adjustmentFields } = reqDto;

    await this.db.transaction(async (tx) => {
      await tx
        .update(inventoryAdjustments)
        .set(adjustmentFields)
        .where(eq(inventoryAdjustments.id, adjustmentId));

      await this.replaceAdjustmentItems(
        tx,
        adjustmentId,
        itemsToReplace,
        baseUnitByItemId,
      );
    });
  }

  async deleteInventoryAdjustment(adjustmentId: string): Promise<void> {
    await this.ensureAdjustmentDraft(adjustmentId);

    await this.db
      .delete(inventoryAdjustments)
      .where(eq(inventoryAdjustments.id, adjustmentId));
  }

  /** `DRAFT → POSTED` — sinh bút toán + cập nhật tồn qua `InventoryPostingService`, sau đó phiếu
   * bất biến. Đọc trạng thái nằm trong cùng transaction, sau `getInventoryAdjustmentForUpdate`.
   * Rỗng dòng (`E151`) dùng lại mã của `inventory_receipts confirm` — phiếu điều chỉnh không có
   * bước `confirm` riêng. Xem `docs/workflows/inventory-adjustment.md`. */
  async postInventoryAdjustment(
    adjustmentId: string,
    userId: string,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const inventoryAdjustment = await this.getInventoryAdjustmentForUpdate(
        tx,
        adjustmentId,
      );

      if (inventoryAdjustment.status !== InventoryDocumentStatus.DRAFT) {
        throw new AppException(ErrorCode.E098, HttpStatus.CONFLICT);
      }

      const itemsToPost = await tx.query.inventoryAdjustmentItems.findMany({
        where: eq(inventoryAdjustmentItems.adjustmentId, adjustmentId),
      });

      if (!itemsToPost.length) {
        throw new AppException(ErrorCode.E151, HttpStatus.BAD_REQUEST);
      }

      const type =
        adjustmentTypeTransactionType[inventoryAdjustment.adjustmentType];
      const sign =
        inventoryAdjustment.adjustmentType === InventoryAdjustmentType.INCREASE
          ? 1
          : -1;

      await this.inventoryPostingService.postDocument(tx, {
        referenceType: InventoryReferenceType.INVENTORY_ADJUSTMENT,
        referenceId: adjustmentId,
        transactionDate: inventoryAdjustment.adjustmentDate,
        createdBy: userId,
        lines: itemsToPost.map((item) => ({
          itemId: item.itemId,
          signedQuantity: sign * item.quantity,
          type,
        })),
      });

      await tx
        .update(inventoryAdjustments)
        .set({
          status: InventoryDocumentStatus.POSTED,
          postedBy: userId,
          postedAt: new Date(),
        })
        .where(eq(inventoryAdjustments.id, adjustmentId));
    });
  }

  /** `DRAFT`/`POSTED → CANCELLED`. Từ `POSTED` thì đảo bút toán trước khi đổi trạng thái — xem
   * `InventoryPostingService.reverseDocument`. */
  async cancelInventoryAdjustment(
    adjustmentId: string,
    userId: string,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const inventoryAdjustment = await this.getInventoryAdjustmentForUpdate(
        tx,
        adjustmentId,
      );

      if (inventoryAdjustment.status === InventoryDocumentStatus.CANCELLED) {
        throw new AppException(ErrorCode.E098, HttpStatus.CONFLICT);
      }

      if (inventoryAdjustment.status === InventoryDocumentStatus.POSTED) {
        await this.inventoryPostingService.reverseDocument(tx, {
          referenceType: InventoryReferenceType.INVENTORY_ADJUSTMENT,
          referenceId: adjustmentId,
          transactionDate: new Date(),
          createdBy: userId,
        });
      }

      await tx
        .update(inventoryAdjustments)
        .set({ status: InventoryDocumentStatus.CANCELLED })
        .where(eq(inventoryAdjustments.id, adjustmentId));
    });
  }

  private async createAdjustmentItems(
    tx: DbTransaction,
    adjustmentId: string,
    itemsToCreate: InventoryAdjustmentItemReqDto[],
    baseUnitByItemId: Map<string, string>,
  ): Promise<void> {
    await tx.insert(inventoryAdjustmentItems).values(
      itemsToCreate.map((item) => ({
        ...item,
        adjustmentId,
        unitId: item.unitId ?? baseUnitByItemId.get(item.itemId)!,
      })),
    );
  }

  private async replaceAdjustmentItems(
    tx: DbTransaction,
    adjustmentId: string,
    itemsToReplace: InventoryAdjustmentItemReqDto[],
    baseUnitByItemId: Map<string, string>,
  ): Promise<void> {
    await tx
      .delete(inventoryAdjustmentItems)
      .where(eq(inventoryAdjustmentItems.adjustmentId, adjustmentId));

    await this.createAdjustmentItems(
      tx,
      adjustmentId,
      itemsToReplace,
      baseUnitByItemId,
    );
  }

  /** Không trùng `itemId` trong cùng payload (`E261`), mọi item tồn tại (`E100`). Trả về
   * `itemId → unitId gốc` để mặc định `unitId` hiển thị khi payload không gửi, cùng khuôn
   * `InventoryIssuesService.ensureItemsValid`. */
  private async ensureItemsValid(
    itemsToValidate: InventoryAdjustmentItemReqDto[],
  ): Promise<Map<string, string>> {
    const itemIds = itemsToValidate.map((item) => item.itemId);

    if (new Set(itemIds).size !== itemIds.length) {
      throw new AppException(ErrorCode.E261, HttpStatus.CONFLICT);
    }

    const found = await this.db.query.items.findMany({
      columns: { id: true, unitId: true },
      where: and(inArray(items.id, itemIds), isNull(items.deletedAt)),
    });

    if (found.length !== itemIds.length) {
      throw new AppException(ErrorCode.E100, HttpStatus.NOT_FOUND);
    }

    return new Map(found.map((item) => [item.id, item.unitId]));
  }

  private async generateAdjustmentCode(
    tx: DbTransaction,
    adjustmentDate: Date,
  ): Promise<string> {
    const year = adjustmentDate.getFullYear();
    const sequence = await generateDocumentSequence(
      tx,
      DocumentType.INVENTORY_ADJUSTMENT,
      year,
    );

    return `PDC-${year}-${String(sequence).padStart(5, '0')}`;
  }

  /** Khoá phiếu (`FOR UPDATE`) rồi trả về — chỉ gọi bên trong transaction, cùng khuôn
   * `InventoryIssuesService.getInventoryIssueForUpdate`. */
  private async getInventoryAdjustmentForUpdate(
    tx: DbTransaction,
    adjustmentId: string,
  ) {
    const [inventoryAdjustment] = await tx
      .select()
      .from(inventoryAdjustments)
      .where(eq(inventoryAdjustments.id, adjustmentId))
      .for('update');

    if (!inventoryAdjustment) {
      throw new AppException(ErrorCode.E096, HttpStatus.NOT_FOUND);
    }

    return inventoryAdjustment;
  }

  private async ensureAdjustmentExists(adjustmentId: string) {
    const existing = await this.db.query.inventoryAdjustments.findFirst({
      where: eq(inventoryAdjustments.id, adjustmentId),
    });

    if (!existing) {
      throw new AppException(ErrorCode.E096, HttpStatus.NOT_FOUND);
    }

    return existing;
  }

  private async ensureAdjustmentDraft(adjustmentId: string) {
    const inventoryAdjustment = await this.ensureAdjustmentExists(adjustmentId);

    if (inventoryAdjustment.status !== InventoryDocumentStatus.DRAFT) {
      throw new AppException(ErrorCode.E098, HttpStatus.CONFLICT);
    }

    return inventoryAdjustment;
  }
}
