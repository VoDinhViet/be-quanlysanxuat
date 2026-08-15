import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { and, count, desc, eq, exists, gte, lt, or, sql } from 'drizzle-orm';

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
  outsourcingOrders,
  outsourcingReceipts,
  type OutsourcingOrderSelect,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { InventoryPostingService } from '../inventory/inventory-posting.service';
import { IqcService } from '../iqc/iqc.service';
import { WarehousesService } from '../warehouses/warehouses.service';
import { CreateOutsourcingReceiptReqDto } from './dto/create-outsourcing-receipt.req.dto';
import { GetOutsourcingReceiptsReqDto } from './dto/get-outsourcing-receipts.req.dto';
import { OutsourcingReceiptResDto } from './dto/outsourcing-receipt.res.dto';
import { PageOutsourcingReceiptResDto } from './dto/page-outsourcing-receipt.res.dto';
import { getReceivedQuantityByOutsourcingOrderId } from './outsourcing-receipts.query';

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
        ? eq(outsourcingReceipts.outsourcingOrderId, reqDto.outsourcingOrderId)
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
              .from(items)
              .where(
                and(
                  eq(items.id, outsourcingReceipts.itemId),
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
          outsourcingOrder: true,
          item: { with: { unit: true } },
          supplier: true,
          warehouse: true,
          creatorBy: true,
        },
      }),
      this.db.select({ total: count() }).from(outsourcingReceipts).where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(PageOutsourcingReceiptResDto, entities, {
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
        outsourcingOrder: true,
        item: { with: { unit: true } },
        supplier: true,
        warehouse: true,
        creatorBy: true,
        posterBy: true,
      },
    });

    if (!row) {
      throw new AppException(ErrorCode.E170, HttpStatus.NOT_FOUND);
    }

    return plainToInstance(OutsourcingReceiptResDto, row, {
      excludeExtraneousValues: true,
    });
  }

  async createOutsourcingReceipt(
    reqDto: CreateOutsourcingReceiptReqDto,
    userId: string,
  ): Promise<OutsourcingReceiptResDto> {
    const order = await this.ensureOutsourcingOrderPosted(
      reqDto.outsourcingOrderId,
    );

    const warehouseId = reqDto.warehouseId ?? order.warehouseId;
    await this.warehousesService.ensureWarehouseActive(warehouseId);

    // Kiểm sớm — tính cả `DRAFT`+`POSTED`, chặn sai sót nhập liệu sớm; `post` kiểm lại chốt thật
    // (chỉ `POSTED`, loại trừ chính dòng đang post).
    const receivedSoFar = await getReceivedQuantityByOutsourcingOrderId(
      this.db,
      {
        outsourcingOrderId: reqDto.outsourcingOrderId,
        statuses: [
          InventoryDocumentStatus.DRAFT,
          InventoryDocumentStatus.POSTED,
        ],
      },
    );
    if (receivedSoFar + reqDto.quantity > order.quantity) {
      throw new AppException(ErrorCode.E172, HttpStatus.BAD_REQUEST);
    }

    const code = await this.generateOutsourcingReceiptCode(this.db);

    const [receipt] = await this.db
      .insert(outsourcingReceipts)
      .values({
        ...reqDto,
        warehouseId,
        code,
        supplierId: order.supplierId,
        itemId: order.itemId,
        createdBy: userId,
      })
      .returning({ id: outsourcingReceipts.id });

    return this.getOutsourcingReceipt(receipt.id);
  }

  async postOutsourcingReceipt(
    outsourcingReceiptId: string,
    userId: string,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const row = await this.lockOutsourcingReceipt(tx, outsourcingReceiptId);

      if (row.status !== InventoryDocumentStatus.DRAFT) {
        throw new AppException(ErrorCode.E098, HttpStatus.CONFLICT);
      }

      const order = await tx.query.outsourcingOrders.findFirst({
        columns: { quantity: true },
        where: eq(outsourcingOrders.id, row.outsourcingOrderId),
      });
      const receivedSoFar = await getReceivedQuantityByOutsourcingOrderId(tx, {
        outsourcingOrderId: row.outsourcingOrderId,
        statuses: [InventoryDocumentStatus.POSTED],
        excludeReceiptId: row.id,
      });
      if (receivedSoFar + row.quantity > (order?.quantity ?? 0)) {
        throw new AppException(ErrorCode.E172, HttpStatus.BAD_REQUEST);
      }

      await this.inventoryPostingService.postDocument(tx, {
        warehouseId: row.warehouseId,
        referenceType: InventoryReferenceType.OUTSOURCING_RECEIPT,
        referenceId: row.id,
        transactionDate: row.receiptDate,
        createdBy: userId,
        lines: [
          {
            itemId: row.itemId,
            // Nhận về luôn cộng tồn — dấu dương.
            signedQuantity: row.quantity,
            type: InventoryTransactionType.RECEIPT,
          },
        ],
      });

      await tx
        .update(outsourcingReceipts)
        .set({
          status: InventoryDocumentStatus.POSTED,
          postedBy: userId,
          postedAt: new Date(),
        })
        .where(eq(outsourcingReceipts.id, outsourcingReceiptId));

      // Hàng đã về kho vật lý ở bước trên rồi — sinh IQC ở đây không gate việc `post`, khác nhánh
      // IQC của phiếu nhập mua (`confirm` mới là nơi gate, `.claude/rules/service.md`).
      if (row.requiresIqc) {
        await this.iqcService.createInspectionFromOutsourcingReceipt(tx, {
          outsourcingReceiptId: row.id,
          supplierId: row.supplierId,
          itemId: row.itemId,
          quantity: row.quantity,
          inspectionDate: new Date(),
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

  private async ensureOutsourcingOrderPosted(
    outsourcingOrderId: string,
  ): Promise<OutsourcingOrderSelect> {
    const order = await this.db.query.outsourcingOrders.findFirst({
      where: eq(outsourcingOrders.id, outsourcingOrderId),
    });

    if (!order) {
      throw new AppException(ErrorCode.E165, HttpStatus.NOT_FOUND);
    }
    if (order.status !== InventoryDocumentStatus.POSTED) {
      throw new AppException(ErrorCode.E171, HttpStatus.CONFLICT);
    }

    return order;
  }

  /** Huỷ OS-IN đã `POSTED` bị chặn (`E173`) nếu đã sinh `iqc_inspections` trỏ vào — cùng lý do
   * `supplier_returns` chưa có `cancel`: cần đường "un-complete" IQC. */
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

  private async generateOutsourcingReceiptCode(
    db: Database | DbTransaction,
  ): Promise<string> {
    const [totalRows] = await db
      .select({ total: count() })
      .from(outsourcingReceipts);
    return `OS-IN-${String((totalRows?.total ?? 0) + 1).padStart(4, '0')}`;
  }
}
