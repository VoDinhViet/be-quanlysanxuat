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
  outsourcingOrderItems,
  outsourcingOrders,
  OutsourcingOrderStatus,
  outsourcingReceiptItems,
  outsourcingReceipts,
  OutsourcingReceiptStatus,
  productionJobs,
  QcKind,
  qcRequests,
  suppliers,
  units,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { IqcService } from '../iqc/iqc.service';
import { CreateOutsourcingReceiptReqDto } from './dto/create-outsourcing-receipt.req.dto';
import { GetOutsourcingReceiptsReqDto } from './dto/get-outsourcing-receipts.req.dto';
import { GetPendingOrderItemsReqDto } from './dto/get-pending-order-items.req.dto';
import { OutsourcingReceiptItemReqDto } from './dto/outsourcing-receipt-item.req.dto';
import { OutsourcingReceiptItemResDto } from './dto/outsourcing-receipt-item.res.dto';
import { OutsourcingReceiptResDto } from './dto/outsourcing-receipt.res.dto';
import { PageOutsourcingReceiptResDto } from './dto/page-outsourcing-receipt.res.dto';
import { PendingOrderItemResDto } from './dto/pending-order-item.res.dto';
import { getReceivedQuantityByOrderItemIds } from './outsourcing-receipts.query';

type ResolvedReceiptItem = {
  outsourcingOrderItemId: string;
  itemId: string;
  quantity: number;
  weight: number | null;
  area: number | null;
  note: string | null;
  // Denormalize từ dòng OS-OUT nguồn — neo sang đúng công đoạn `OUTSOURCE` sinh ra dòng này, dùng
  // để gắn `qcRequests.productionJobOperationId` khi `requiresIqc` (xem
  // `createOutsourcingReceipt`, `docs/domains/quality-iqc.md`).
  productionJobId: string | null;
  productionJobOperationId: string | null;
};

@Injectable()
export class OutsourcingReceiptsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly iqcService: IqcService,
  ) {}

  async getOutsourcingReceipts(
    reqDto: GetOutsourcingReceiptsReqDto,
  ): Promise<OffsetPaginatedDto<PageOutsourcingReceiptResDto>> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;

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
      reqDto.status ? eq(outsourcingReceipts.status, reqDto.status) : undefined,
      reqDto.requiresIqc !== undefined
        ? eq(outsourcingReceipts.requiresIqc, reqDto.requiresIqc)
        : undefined,
      reqDto.startDate
        ? gte(outsourcingReceipts.receiptDate, reqDto.startDate)
        : undefined,
      reqDto.endDate
        ? lt(
            outsourcingReceipts.receiptDate,
            new Date(reqDto.endDate.getTime() + 24 * 60 * 60 * 1000),
          )
        : undefined,
    );

    const [entities, countRows] = await Promise.all([
      this.db.query.outsourcingReceipts.findMany({
        where,
        limit: reqDto.limit,
        offset: reqDto.offset,
        orderBy: desc(outsourcingReceipts.createdAt),
        with: { supplier: true, creatorBy: true },
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
    const outsourcingReceipt =
      await this.db.query.outsourcingReceipts.findFirst({
        where: eq(outsourcingReceipts.id, outsourcingReceiptId),
        with: { supplier: true, creatorBy: true, posterBy: true },
      });

    if (!outsourcingReceipt) {
      throw new AppException(ErrorCode.E170, HttpStatus.NOT_FOUND);
    }

    return plainToInstance(OutsourcingReceiptResDto, outsourcingReceipt, {
      excludeExtraneousValues: true,
    });
  }

  /** Join phẳng `outsourcing_receipt_items -> outsourcing_order_items -> outsourcing_orders` +
   * `-> items -> units` cho một phiếu — `.select()` + join tường minh thay vì relational `with:`
   * lồng 2 cấp: DTO nhận `item`/`unit` cùng cấp (không lồng `item.unit`), khớp thẳng shape select,
   * không cần map lại. `operationCode`/`operationName`/`outsourcingOrder` chỉ tồn tại trên dòng
   * OS-OUT nguồn, không denormalize trên `outsourcing_receipt_items`. */
  async getReceiptItems(
    outsourcingReceiptId: string,
  ): Promise<OutsourcingReceiptItemResDto[]> {
    await this.ensureOutsourcingReceiptExists(outsourcingReceiptId);

    const rows = await this.db
      .select({
        ...getTableColumns(outsourcingReceiptItems),
        operationCode: outsourcingOrderItems.operationCode,
        operationName: outsourcingOrderItems.operationName,
        outsourcingOrder: getTableColumns(outsourcingOrders),
        item: getTableColumns(items),
        unit: getTableColumns(units),
      })
      .from(outsourcingReceiptItems)
      .innerJoin(
        outsourcingOrderItems,
        eq(
          outsourcingOrderItems.id,
          outsourcingReceiptItems.outsourcingOrderItemId,
        ),
      )
      .innerJoin(
        outsourcingOrders,
        eq(outsourcingOrders.id, outsourcingOrderItems.outsourcingOrderId),
      )
      .innerJoin(items, eq(items.id, outsourcingReceiptItems.itemId))
      .innerJoin(units, eq(units.id, items.unitId))
      .where(
        eq(outsourcingReceiptItems.outsourcingReceiptId, outsourcingReceiptId),
      )
      .orderBy(asc(outsourcingReceiptItems.sortOrder));

    return plainToInstance(OutsourcingReceiptItemResDto, rows, {
      excludeExtraneousValues: true,
    });
  }

  async getPendingOrderItems(
    reqDto: GetPendingOrderItemsReqDto,
  ): Promise<OffsetPaginatedDto<PendingOrderItemResDto>> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;

    const where = and(
      eq(outsourcingOrders.status, OutsourcingOrderStatus.POSTED),
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

  /** Không còn nháp — tạo là nhận luôn: resolve/validate xong thì `INSERT` header thẳng `POSTED`,
   * sinh IQC nếu `requiresIqc` ngay sau đó. Không đụng `inventory_balances` — hàng nhận về là cùng
   * WIP đã trừ ở OS-OUT, kho không quản tồn WIP (`docs/decisions/wip-not-stocked.md`). */
  async createOutsourcingReceipt(
    reqDto: CreateOutsourcingReceiptReqDto,
    userId: string,
  ): Promise<void> {
    this.validateReceiptItems(reqDto.items);

    const resolvedItems = await this.resolveReceiptItems(
      reqDto.items,
      reqDto.supplierId,
    );

    const { items: _items, ...receiptFields } = reqDto;

    await this.db.transaction(async (tx) => {
      const code = await this.generateOutsourcingReceiptCode(tx);
      const [outsourcingReceipt] = await tx
        .insert(outsourcingReceipts)
        .values({
          ...receiptFields,
          code,
          createdBy: userId,
          status: OutsourcingReceiptStatus.POSTED,
          postedBy: userId,
          postedAt: new Date(),
        })
        .returning();

      const insertedItems = await tx
        .insert(outsourcingReceiptItems)
        .values(
          resolvedItems.map((item, index) => {
            const {
              productionJobId: _jobId,
              productionJobOperationId: _opId,
              ...columns
            } = item;
            return {
              ...columns,
              outsourcingReceiptId: outsourcingReceipt.id,
              sortOrder: index,
            };
          }),
        )
        .returning();

      // Hàng đã về nhà máy vật lý (không phải ghi tồn — kho không quản tồn WIP) ngay khi lập phiếu,
      // nên sinh IQC ở đây không gate việc `create`, khác nhánh IQC của phiếu nhập mua (`confirm`
      // mới là nơi gate, `.claude/rules/service.md`). `insertedItems`/`resolvedItems` cùng thứ tự —
      // cùng xây từ một `.map()` trên `resolvedItems`, Postgres giữ nguyên thứ tự RETURNING cho
      // INSERT nhiều dòng một câu lệnh — zip theo index để lấy neo công đoạn của từng dòng.
      if (outsourcingReceipt.requiresIqc && insertedItems.length) {
        await this.iqcService.createInspectionsFromOutsourcingReceipt(tx, {
          outsourcingReceiptId: outsourcingReceipt.id,
          supplierId: outsourcingReceipt.supplierId,
          inspectionDate: new Date(),
          lines: insertedItems.map((item, index) => ({
            outsourcingReceiptItemId: item.id,
            itemId: item.itemId,
            quantity: item.quantity,
            productionJobId: resolvedItems[index].productionJobId,
            productionJobOperationId:
              resolvedItems[index].productionJobOperationId,
          })),
          userId,
        });
      }
    });
  }

  async cancelOutsourcingReceipt(outsourcingReceiptId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const outsourcingReceipt = await this.getOutsourcingReceiptForUpdate(
        tx,
        outsourcingReceiptId,
      );

      if (outsourcingReceipt.status === OutsourcingReceiptStatus.CANCELLED) {
        throw new AppException(ErrorCode.E098, HttpStatus.CONFLICT);
      }

      if (outsourcingReceipt.status === OutsourcingReceiptStatus.POSTED) {
        const hasLinkedIqc = await this.hasLinkedIqc(tx, outsourcingReceiptId);
        if (hasLinkedIqc) {
          throw new AppException(ErrorCode.E173, HttpStatus.CONFLICT);
        }
      }

      await tx
        .update(outsourcingReceipts)
        .set({ status: OutsourcingReceiptStatus.CANCELLED })
        .where(eq(outsourcingReceipts.id, outsourcingReceiptId));
    });
  }

  private validateReceiptItems(reqItems: OutsourcingReceiptItemReqDto[]): void {
    if (!reqItems.length) {
      throw new AppException(ErrorCode.E185, HttpStatus.BAD_REQUEST);
    }

    const orderItemIds = reqItems.map((item) => item.outsourcingOrderItemId);
    if (new Set(orderItemIds).size !== orderItemIds.length) {
      throw new AppException(ErrorCode.E186, HttpStatus.BAD_REQUEST);
    }
  }

  /** Suy dữ liệu ghi cho từng dòng, `weight`/`area` mặc định copy từ dòng OS-OUT khi client không
   * gửi. */
  private async resolveReceiptItems(
    reqItems: OutsourcingReceiptItemReqDto[],
    supplierId: string,
  ): Promise<ResolvedReceiptItem[]> {
    const orderItemIds = reqItems.map((item) => item.outsourcingOrderItemId);

    // Hai truy vấn độc lập — `receivedMap` chỉ cần `orderItemIds`, không cần `orderItems` — chạy
    // song song thay vì tuần tự.
    const [orderItemById, receivedMap] = await Promise.all([
      this.fetchOrderItemsById(orderItemIds),
      getReceivedQuantityByOrderItemIds(this.db, orderItemIds),
    ]);

    for (const orderItemId of orderItemIds) {
      this.ensureOrderItemValid(orderItemById.get(orderItemId), supplierId);
    }

    return reqItems.map((item) => {
      const orderItem = orderItemById.get(item.outsourcingOrderItemId)!;
      const receivedSoFar = receivedMap.get(item.outsourcingOrderItemId) ?? 0;
      this.ensureQuantityWithinOrdered(
        receivedSoFar,
        item.quantity,
        orderItem.quantity,
      );

      return {
        outsourcingOrderItemId: item.outsourcingOrderItemId,
        itemId: orderItem.itemId,
        quantity: item.quantity,
        weight: item.weight ?? orderItem.weight,
        area: item.area ?? orderItem.area,
        note: item.note ?? null,
        productionJobId: orderItem.productionJobId,
        productionJobOperationId: orderItem.productionJobOperationId,
      };
    });
  }

  private async fetchOrderItemsById(orderItemIds: string[]) {
    const orderItems = await this.db.query.outsourcingOrderItems.findMany({
      where: inArray(outsourcingOrderItems.id, orderItemIds),
      with: { outsourcingOrder: true },
    });

    return new Map(orderItems.map((row) => [row.id, row]));
  }

  /** OS-OUT nguồn tồn tại (`E165`, tái dùng mã "không tìm thấy OS-OUT" — cùng aggregate) + `POSTED`
   * (`E171`) + NCC khớp header (`E187`). */
  private ensureOrderItemValid(
    orderItem:
      | {
          outsourcingOrder: {
            status: OutsourcingOrderStatus;
            supplierId: string;
          };
        }
      | undefined,
    supplierId: string,
  ): void {
    if (!orderItem) {
      throw new AppException(ErrorCode.E165, HttpStatus.NOT_FOUND);
    }
    if (orderItem.outsourcingOrder.status !== OutsourcingOrderStatus.POSTED) {
      throw new AppException(ErrorCode.E171, HttpStatus.CONFLICT);
    }
    if (orderItem.outsourcingOrder.supplierId !== supplierId) {
      throw new AppException(ErrorCode.E187, HttpStatus.BAD_REQUEST);
    }
  }

  /** Chặn nhận vượt SL gửi của dòng OS-OUT (`E172`, tính trên `POSTED` — không còn phiếu nào ở
   * `DRAFT` để cộng dồn). */
  private ensureQuantityWithinOrdered(
    receivedSoFar: number,
    quantity: number,
    orderedQuantity: number,
  ): void {
    if (receivedSoFar + quantity > orderedQuantity) {
      throw new AppException(ErrorCode.E172, HttpStatus.BAD_REQUEST);
    }
  }

  /** Huỷ OS-IN đã `POSTED` bị chặn (`E173`) nếu đã sinh `qc_requests` (`kind = INCOMING`)
   * trỏ vào — cùng lý do `supplier_returns` chưa có `cancel`: cần đường "un-complete" IQC. Chặn bất
   * kể trạng thái IQC, kể cả đã `COMPLETED`. */
  private async hasLinkedIqc(
    tx: DbTransaction,
    outsourcingReceiptId: string,
  ): Promise<boolean> {
    const existing = await tx.query.qcRequests.findFirst({
      columns: { id: true },
      where: and(
        eq(qcRequests.kind, QcKind.INCOMING),
        eq(qcRequests.outsourcingReceiptId, outsourcingReceiptId),
      ),
    });

    return !!existing;
  }

  private async getOutsourcingReceiptForUpdate(
    tx: DbTransaction,
    outsourcingReceiptId: string,
  ) {
    const [outsourcingReceipt] = await tx
      .select()
      .from(outsourcingReceipts)
      .where(eq(outsourcingReceipts.id, outsourcingReceiptId))
      .for('update');

    if (!outsourcingReceipt) {
      throw new AppException(ErrorCode.E170, HttpStatus.NOT_FOUND);
    }

    return outsourcingReceipt;
  }

  private async ensureOutsourcingReceiptExists(
    outsourcingReceiptId: string,
  ): Promise<void> {
    const existing = await this.db.query.outsourcingReceipts.findFirst({
      columns: { id: true },
      where: eq(outsourcingReceipts.id, outsourcingReceiptId),
    });

    if (!existing) {
      throw new AppException(ErrorCode.E170, HttpStatus.NOT_FOUND);
    }
  }

  private async generateOutsourcingReceiptCode(
    tx: DbTransaction,
  ): Promise<string> {
    const sequence = await generateDocumentSequence(
      tx,
      DocumentType.OUTSOURCING_RECEIPT,
    );

    return `OS-IN-${String(sequence).padStart(4, '0')}`;
  }
}
