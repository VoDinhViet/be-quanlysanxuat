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
  ne,
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
  files,
  items,
  productionJobBomItems,
  outsourcingOrderItems,
  outsourcingOrders,
  OutsourcingOrderStatus,
  outsourcingReceiptItems,
  outsourcingReceipts,
  OutsourcingReceiptStatus,
  productionJobs,
  QualityInspectionOriginType,
  QualityInspectionType,
  qualityInspections,
  suppliers,
  units,
  users,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { IqcService } from '../iqc/iqc.service';
import { recomputeOutsourcingOrderStatus } from '../outsourcing-orders/outsourcing-orders.query';
import { recomputeOutsourcedOperationProgress } from '../production-jobs/production-jobs.query';
import { CreateOutsourcingReceiptReqDto } from './dto/create-outsourcing-receipt.req.dto';
import { GetOutsourcingReceiptsReqDto } from './dto/get-outsourcing-receipts.req.dto';
import { GetPendingOrderItemsReqDto } from './dto/get-pending-order-items.req.dto';
import { OutsourcingReceiptItemReqDto } from './dto/outsourcing-receipt-item.req.dto';
import { OutsourcingReceiptItemResDto } from './dto/outsourcing-receipt-item.res.dto';
import { OutsourcingReceiptResDto } from './dto/outsourcing-receipt.res.dto';
import { PageOutsourcingReceiptResDto } from './dto/page-outsourcing-receipt.res.dto';
import { PendingOrderItemResDto } from './dto/pending-order-item.res.dto';
import {
  getReceivedQuantityByOrderItemIds,
  receivedQuantityByOrderItemIdSubquery,
  totalQuantityByReceiptIdSubquery,
} from './outsourcing-receipts.query';

type ResolvedReceiptItem = {
  outsourcingOrderItemId: string;
  // Phiếu OS-OUT chứa dòng nguồn, dùng để `recomputeOutsourcingOrderStatus` sau khi insert; không
  // ghi xuống `outsourcing_receipt_items`.
  outsourcingOrderId: string;
  itemCode: string;
  itemName: string;
  itemId: string | null;
  quantity: number;
  weight: number | null;
  area: number | null;
  note: string | null;
  // Lấy từ dòng OS-OUT nguồn để gắn `qualityInspections.productionJobOperationId` khi `requiresIqc`
  // (xem `docs/CODEMAPS/quality.md`); không ghi xuống `outsourcing_receipt_items`.
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

    const totalQuantityByReceipt = totalQuantityByReceiptIdSubquery(this.db);

    const [entities, [{ total }]] = await Promise.all([
      this.db
        .select({
          ...getTableColumns(outsourcingReceipts),
          supplier: getTableColumns(suppliers),
          creatorBy: getTableColumns(users),
          totalQuantity:
            sql<number>`coalesce(${totalQuantityByReceipt.totalQuantity}, 0)`.mapWith(
              Number,
            ),
        })
        .from(outsourcingReceipts)
        .innerJoin(suppliers, eq(suppliers.id, outsourcingReceipts.supplierId))
        .leftJoin(users, eq(users.id, outsourcingReceipts.createdBy))
        .leftJoin(
          totalQuantityByReceipt,
          eq(
            totalQuantityByReceipt.outsourcingReceiptId,
            outsourcingReceipts.id,
          ),
        )
        .where(where)
        .orderBy(desc(outsourcingReceipts.createdAt))
        .limit(reqDto.limit)
        .offset(reqDto.offset),
      this.db.select({ total: count() }).from(outsourcingReceipts).where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(PageOutsourcingReceiptResDto, entities, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(total, reqDto),
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

  /** Dùng `.select()` + join tường minh thay vì relational `with:` để DTO nhận `item`/`unit` cùng
   * cấp (không lồng `item.unit`). `operationCode`, `operationName` và `outsourcingOrder` lấy từ
   * dòng OS-OUT nguồn, không có trên `outsourcing_receipt_items`. */
  async getReceiptItems(
    outsourcingReceiptId: string,
  ): Promise<OutsourcingReceiptItemResDto[]> {
    await this.ensureOutsourcingReceiptExists(outsourcingReceiptId);

    const receiptItemRows = await this.db
      .select({
        ...getTableColumns(outsourcingReceiptItems),
        operationCode: outsourcingOrderItems.operationCode,
        operationName: outsourcingOrderItems.operationName,
        outsourcingOrder: getTableColumns(outsourcingOrders),
        item: {
          ...getTableColumns(items),
          revision: sql<string>`coalesce(${productionJobBomItems.revision}, ${items.revision})`,
        },
        unit: getTableColumns(units),
        imageFile: getTableColumns(files),
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
      .leftJoin(items, eq(items.id, outsourcingReceiptItems.itemId))
      .leftJoin(units, eq(units.id, items.unitId))
      .leftJoin(
        productionJobBomItems,
        eq(
          productionJobBomItems.id,
          outsourcingOrderItems.productionJobBomItemId,
        ),
      )
      .leftJoin(files, eq(files.id, productionJobBomItems.imageFileId))
      .where(
        eq(outsourcingReceiptItems.outsourcingReceiptId, outsourcingReceiptId),
      )
      .orderBy(asc(outsourcingReceiptItems.sortOrder));

    return plainToInstance(OutsourcingReceiptItemResDto, receiptItemRows, {
      excludeExtraneousValues: true,
    });
  }

  async getPendingOrderItems(
    reqDto: GetPendingOrderItemsReqDto,
  ): Promise<OffsetPaginatedDto<PendingOrderItemResDto>> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;

    const where = and(
      ne(outsourcingOrders.status, OutsourcingOrderStatus.CANCELLED),
      reqDto.operationId
        ? eq(outsourcingOrderItems.operationId, reqDto.operationId)
        : undefined,
      keyword
        ? or(
            unaccentILike(outsourcingOrderItems.operationCode, keyword),
            unaccentILike(outsourcingOrderItems.operationName, keyword),
            unaccentILike(outsourcingOrderItems.itemCode, keyword),
            unaccentILike(outsourcingOrderItems.itemName, keyword),
            unaccentILike(outsourcingOrders.code, keyword),
          )
        : undefined,
    );

    const receivedQuantityByItem = receivedQuantityByOrderItemIdSubquery(
      this.db,
    );

    const [pendingOrderItemRows, [{ total }]] = await Promise.all([
      this.db
        .select({
          id: outsourcingOrderItems.id,
          outsourcingOrder: getTableColumns(outsourcingOrders),
          supplier: getTableColumns(suppliers),
          jobCode: productionJobs.code,
          itemCode: outsourcingOrderItems.itemCode,
          itemName: outsourcingOrderItems.itemName,
          item: {
            ...getTableColumns(items),
            revision: sql<string>`coalesce(${productionJobBomItems.revision}, ${items.revision})`,
          },
          unit: getTableColumns(units),
          imageFile: getTableColumns(files),
          operationCode: outsourcingOrderItems.operationCode,
          operationName: outsourcingOrderItems.operationName,
          quantity: outsourcingOrderItems.quantity,
          receivedQuantity:
            sql<number>`coalesce(${receivedQuantityByItem.receivedQuantity}, 0)`.mapWith(
              Number,
            ),
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
        .leftJoin(items, eq(items.id, outsourcingOrderItems.itemId))
        .leftJoin(units, eq(units.id, items.unitId))
        .leftJoin(
          productionJobBomItems,
          eq(
            productionJobBomItems.id,
            outsourcingOrderItems.productionJobBomItemId,
          ),
        )
        .leftJoin(files, eq(files.id, productionJobBomItems.imageFileId))
        .leftJoin(
          receivedQuantityByItem,
          eq(
            receivedQuantityByItem.outsourcingOrderItemId,
            outsourcingOrderItems.id,
          ),
        )
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
      plainToInstance(PendingOrderItemResDto, pendingOrderItemRows, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(total, reqDto),
    );
  }

  /** Tạo là nhận luôn: header `INSERT` thẳng ở `POSTED`, không có bước nháp.
   *
   * Rules:
   * - Sinh IQC ngay nếu `requiresIqc`, rồi `recomputeOutsourcingOrderStatus` cho từng OS-OUT nguồn.
   * - Không đụng `inventory_balances`: hàng nhận về là node COMPONENT của Job, không có tồn.
   */
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

      // Hàng đã về nhà máy ngay khi lập phiếu nên sinh IQC ở đây, không gate `create` (khác phiếu
      // nhập mua, gate ở `confirm`). `insertedItems` cùng thứ tự `resolvedItems` (INSERT nhiều dòng
      // giữ thứ tự RETURNING), nên zip theo index để lấy neo công đoạn của từng dòng.
      if (outsourcingReceipt.requiresIqc && insertedItems.length) {
        await this.iqcService.createInspectionsFromOutsourcingReceipt(tx, {
          outsourcingReceiptId: outsourcingReceipt.id,
          supplierId: outsourcingReceipt.supplierId,
          inspectionDate: new Date(),
          lines: insertedItems.map((item, index) => ({
            outsourcingReceiptItemId: item.id,
            itemId: item.itemId,
            itemCode: item.itemCode,
            itemName: item.itemName,
            quantity: item.quantity,
            productionJobId: resolvedItems[index].productionJobId,
            productionJobOperationId:
              resolvedItems[index].productionJobOperationId,
          })),
          userId,
        });
      }

      // Một OS-IN có thể gộp nhiều OS-OUT cùng NCC: tính lại status từng phiếu nguồn.
      const affectedOrderIds = new Set(
        resolvedItems.map((item) => item.outsourcingOrderId),
      );
      for (const outsourcingOrderId of affectedOrderIds) {
        await recomputeOutsourcingOrderStatus(tx, outsourcingOrderId);
      }

      // Ghi ngược tiến độ các công đoạn `OUTSOURCE` vừa nhận về (một phiếu có thể chạm nhiều).
      const affectedOperationIds = new Set(
        resolvedItems
          .map((item) => item.productionJobOperationId)
          .filter((id): id is string => id !== null),
      );
      for (const productionJobOperationId of affectedOperationIds) {
        await recomputeOutsourcedOperationProgress(
          tx,
          productionJobOperationId,
        );
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

      // Tập OS-OUT/công đoạn bị ảnh hưởng để recompute sau khi huỷ (cả hai recompute chỉ tính
      // OS-IN `POSTED`).
      const affectedTargets = await this.getRecomputeTargetsForReceipt(
        tx,
        outsourcingReceiptId,
      );

      await tx
        .update(outsourcingReceipts)
        .set({ status: OutsourcingReceiptStatus.CANCELLED })
        .where(eq(outsourcingReceipts.id, outsourcingReceiptId));

      for (const outsourcingOrderId of affectedTargets.outsourcingOrderIds) {
        await recomputeOutsourcingOrderStatus(tx, outsourcingOrderId);
      }
      for (const productionJobOperationId of affectedTargets.productionJobOperationIds) {
        await recomputeOutsourcedOperationProgress(
          tx,
          productionJobOperationId,
        );
      }
    });
  }

  private async getRecomputeTargetsForReceipt(
    tx: DbTransaction,
    outsourcingReceiptId: string,
  ): Promise<{
    outsourcingOrderIds: Set<string>;
    productionJobOperationIds: Set<string>;
  }> {
    const rows = await tx
      .selectDistinct({
        outsourcingOrderId: outsourcingOrderItems.outsourcingOrderId,
        productionJobOperationId:
          outsourcingOrderItems.productionJobOperationId,
      })
      .from(outsourcingReceiptItems)
      .innerJoin(
        outsourcingOrderItems,
        eq(
          outsourcingOrderItems.id,
          outsourcingReceiptItems.outsourcingOrderItemId,
        ),
      )
      .where(
        eq(outsourcingReceiptItems.outsourcingReceiptId, outsourcingReceiptId),
      );

    return {
      outsourcingOrderIds: new Set(rows.map((row) => row.outsourcingOrderId)),
      productionJobOperationIds: new Set(
        rows
          .map((row) => row.productionJobOperationId)
          .filter((id): id is string => id !== null),
      ),
    };
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

  /** `weight`/`area` mặc định copy từ dòng OS-OUT khi client không gửi. */
  private async resolveReceiptItems(
    reqItems: OutsourcingReceiptItemReqDto[],
    supplierId: string,
  ): Promise<ResolvedReceiptItem[]> {
    const orderItemIds = reqItems.map((item) => item.outsourcingOrderItemId);

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
        outsourcingOrderId: orderItem.outsourcingOrderId,
        itemCode: orderItem.itemCode,
        itemName: orderItem.itemName,
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

  /** Dòng OS-OUT nguồn phải tồn tại (`E165`, dùng chung mã "không tìm thấy OS-OUT"), phiếu chưa
   * `CANCELLED` (`E171`) và cùng NCC với header (`E187`). */
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
    if (
      orderItem.outsourcingOrder.status === OutsourcingOrderStatus.CANCELLED
    ) {
      throw new AppException(ErrorCode.E171, HttpStatus.CONFLICT);
    }
    if (orderItem.outsourcingOrder.supplierId !== supplierId) {
      throw new AppException(ErrorCode.E187, HttpStatus.BAD_REQUEST);
    }
  }

  /** Chặn nhận vượt SL gửi của dòng OS-OUT (`E172`); `receivedSoFar` chỉ tính OS-IN `POSTED`. */
  private ensureQuantityWithinOrdered(
    receivedSoFar: number,
    quantity: number,
    orderedQuantity: number,
  ): void {
    if (receivedSoFar + quantity > orderedQuantity) {
      throw new AppException(ErrorCode.E172, HttpStatus.BAD_REQUEST);
    }
  }

  /** Đã có IQC (`quality_inspections`, `inspectionType = IQC`) trỏ vào OS-IN này chưa; có thì chặn
   * huỷ (`E173`) bất kể trạng thái IQC, kể cả `COMPLETED`, vì chưa có đường "un-complete" IQC (cùng
   * lý do `supplier_returns` chưa có `cancel`). `originId` chỉ giữ `outsourcingReceiptItemId`, nên
   * join qua `outsourcing_receipt_items` (xem `quality-inspections.ts`). */
  private async hasLinkedIqc(
    tx: DbTransaction,
    outsourcingReceiptId: string,
  ): Promise<boolean> {
    const [existing] = await tx
      .select({ id: qualityInspections.id })
      .from(qualityInspections)
      .innerJoin(
        outsourcingReceiptItems,
        and(
          eq(
            qualityInspections.originType,
            QualityInspectionOriginType.OUTSOURCING_RECEIPT_ITEM,
          ),
          eq(qualityInspections.originId, outsourcingReceiptItems.id),
        ),
      )
      .where(
        and(
          eq(qualityInspections.inspectionType, QualityInspectionType.IQC),
          eq(
            outsourcingReceiptItems.outsourcingReceiptId,
            outsourcingReceiptId,
          ),
        ),
      )
      .limit(1);

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
