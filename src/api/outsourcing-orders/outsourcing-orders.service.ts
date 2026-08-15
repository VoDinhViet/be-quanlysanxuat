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
  lt,
  ne,
  or,
  sql,
  type SQL,
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
  items,
  OperationType,
  outsourcingOrders,
  outsourcingReceipts,
  productionJobOperations,
  ProductionJobStatus,
  suppliers,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { InventoryPostingService } from '../inventory/inventory-posting.service';
import {
  getReceivedQuantityByOutsourcingOrderId,
  receivedQuantityByOutsourcingOrderSubquery,
} from '../outsourcing-receipts/outsourcing-receipts.query';
import { WarehousesService } from '../warehouses/warehouses.service';
import { CreateOutsourcingOrderReqDto } from './dto/create-outsourcing-order.req.dto';
import { GetOutsourcingOrdersReqDto } from './dto/get-outsourcing-orders.req.dto';
import { OutsourcingOrderResDto } from './dto/outsourcing-order.res.dto';
import { PageOutsourcingOrderResDto } from './dto/page-outsourcing-order.res.dto';
import { OutsourcingOrderProgress } from './outsourcing-orders.constant';
import type { ProductionJobOperationSource } from './types/production-job-operation-source.type';

type OutsourcingProgressRefs = {
  receivedQuantity: SQL<number>;
};

@Injectable()
export class OutsourcingOrdersService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly warehousesService: WarehousesService,
    private readonly inventoryPostingService: InventoryPostingService,
  ) {}

  async getOutsourcingOrders(
    reqDto: GetOutsourcingOrdersReqDto,
  ): Promise<OffsetPaginatedDto<PageOutsourcingOrderResDto>> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;
    const materialKeyword = reqDto.materialKeyword
      ? `%${reqDto.materialKeyword}%`
      : undefined;

    const receivedAgg = receivedQuantityByOutsourcingOrderSubquery(this.db);
    const refs = this.buildProgressRefs(receivedAgg);

    const where = and(
      keyword ? unaccentILike(outsourcingOrders.code, keyword) : undefined,
      reqDto.supplierId
        ? eq(outsourcingOrders.supplierId, reqDto.supplierId)
        : undefined,
      reqDto.warehouseId
        ? eq(outsourcingOrders.warehouseId, reqDto.warehouseId)
        : undefined,
      reqDto.productionJobId
        ? eq(outsourcingOrders.productionJobId, reqDto.productionJobId)
        : undefined,
      reqDto.operationId
        ? eq(outsourcingOrders.operationId, reqDto.operationId)
        : undefined,
      reqDto.status ? eq(outsourcingOrders.status, reqDto.status) : undefined,
      reqDto.progress
        ? this.buildProgressCondition(refs, reqDto.progress)
        : undefined,
      materialKeyword
        ? exists(
            this.db
              .select({ one: sql`1` })
              .from(items)
              .where(
                and(
                  eq(items.id, outsourcingOrders.itemId),
                  or(
                    unaccentILike(items.name, materialKeyword),
                    unaccentILike(items.code, materialKeyword),
                  ),
                ),
              ),
          )
        : undefined,
      reqDto.fromDate
        ? gte(outsourcingOrders.sendDate, reqDto.fromDate)
        : undefined,
      // Biên trên loại trừ — `toDate` parse ra nửa đêm UTC, `lte` sẽ bỏ sót cùng ngày.
      reqDto.toDate
        ? lt(
            outsourcingOrders.sendDate,
            new Date(reqDto.toDate.getTime() + 24 * 60 * 60 * 1000),
          )
        : undefined,
    );

    // Bước 1: lọc/phân trang trên bảng gốc (join aggregate SL đã nhận), chưa hydrate quan hệ —
    // không lọc theo `progress` (suy từ aggregate) được bằng relational query API, nên tách 2
    // bước, cùng khuôn `PurchaseOrdersService.getPurchaseOrders`.
    const [idRows, countRows] = await Promise.all([
      this.db
        .select({
          id: outsourcingOrders.id,
          receivedQuantity: refs.receivedQuantity,
        })
        .from(outsourcingOrders)
        .leftJoin(
          receivedAgg,
          eq(receivedAgg.outsourcingOrderId, outsourcingOrders.id),
        )
        .where(where)
        .orderBy(desc(outsourcingOrders.createdAt))
        .limit(reqDto.limit)
        .offset(reqDto.offset),
      this.db
        .select({ total: count() })
        .from(outsourcingOrders)
        .leftJoin(
          receivedAgg,
          eq(receivedAgg.outsourcingOrderId, outsourcingOrders.id),
        )
        .where(where),
    ]);

    const ids = idRows.map((row) => row.id);

    // Bước 2: hydrate quan hệ — chỉ cho đúng trang hiện tại.
    const entities = ids.length
      ? await this.db.query.outsourcingOrders.findMany({
          where: inArray(outsourcingOrders.id, ids),
          with: {
            item: { with: { unit: true } },
            supplier: true,
            warehouse: true,
            productionJob: true,
            creatorBy: true,
          },
        })
      : [];

    const entityById = new Map(entities.map((entity) => [entity.id, entity]));

    // Giữ đúng thứ tự đã sắp/phân trang ở bước 1 — `findMany` không đảm bảo giữ thứ tự `inArray`.
    const rows = idRows.flatMap((row) => {
      const entity = entityById.get(row.id);
      if (!entity) return [];
      return [
        {
          ...entity,
          receivedQuantity: row.receivedQuantity,
          progress: this.resolveOrderProgress(
            entity.status,
            entity.quantity,
            row.receivedQuantity,
          ),
        },
      ];
    });

    return new OffsetPaginatedDto(
      plainToInstance(PageOutsourcingOrderResDto, rows, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(countRows[0]?.total ?? 0, reqDto),
    );
  }

  /** Coalesce aggregate SL đã nhận về 0 — LEFT JOIN không khớp dòng nào (OS-OUT chưa có OS-IN
   * `POSTED` nào) thì cột này null. Cùng khuôn `PurchaseOrdersService.buildProgressRefs`. */
  private buildProgressRefs(
    receivedAgg: ReturnType<typeof receivedQuantityByOutsourcingOrderSubquery>,
  ): OutsourcingProgressRefs {
    return {
      receivedQuantity:
        sql<number>`coalesce(${receivedAgg.receivedQuantity}, 0)`.mapWith(
          Number,
        ),
    };
  }

  /** Cùng thứ tự ưu tiên với `buildProgressCondition` (sửa một cái phải sửa cái kia) — tính bằng
   * JS thuần, chỉ cho response, không cần select/sort theo nó. */
  private resolveOrderProgress(
    status: InventoryDocumentStatus,
    quantity: number,
    receivedQuantity: number,
  ): OutsourcingOrderProgress {
    if (status === InventoryDocumentStatus.CANCELLED) {
      return OutsourcingOrderProgress.CANCELLED;
    }
    if (status === InventoryDocumentStatus.DRAFT) {
      return OutsourcingOrderProgress.DRAFT;
    }
    if (receivedQuantity >= quantity) {
      return OutsourcingOrderProgress.COMPLETED;
    }
    if (receivedQuantity > 0) {
      return OutsourcingOrderProgress.PARTIAL;
    }
    return OutsourcingOrderProgress.SENT;
  }

  /** Điều kiện lọc `WHERE` khớp đúng một giá trị `OutsourcingOrderProgress` — mỗi nhánh loại trừ
   * lẫn nhau, phủ đúng logic của `resolveOrderProgress`. `quantity` luôn > 0 (DB CHECK) nên khác
   * `PurchaseOrdersService.buildProgressCondition`, không cần guard `quantity > 0` riêng. */
  private buildProgressCondition(
    refs: OutsourcingProgressRefs,
    progress: OutsourcingOrderProgress,
  ): SQL {
    switch (progress) {
      case OutsourcingOrderProgress.CANCELLED:
        return eq(outsourcingOrders.status, InventoryDocumentStatus.CANCELLED);
      case OutsourcingOrderProgress.DRAFT:
        return eq(outsourcingOrders.status, InventoryDocumentStatus.DRAFT);
      case OutsourcingOrderProgress.COMPLETED:
        return sql`(
          ${outsourcingOrders.status} = ${InventoryDocumentStatus.POSTED}
          and ${refs.receivedQuantity} >= ${outsourcingOrders.quantity}
        )`;
      case OutsourcingOrderProgress.PARTIAL:
        return sql`(
          ${outsourcingOrders.status} = ${InventoryDocumentStatus.POSTED}
          and ${refs.receivedQuantity} > 0
          and ${refs.receivedQuantity} < ${outsourcingOrders.quantity}
        )`;
      case OutsourcingOrderProgress.SENT:
        return sql`(
          ${outsourcingOrders.status} = ${InventoryDocumentStatus.POSTED}
          and ${refs.receivedQuantity} = 0
        )`;
    }
  }

  async getOutsourcingOrder(
    outsourcingOrderId: string,
  ): Promise<OutsourcingOrderResDto> {
    const order = await this.db.query.outsourcingOrders.findFirst({
      where: eq(outsourcingOrders.id, outsourcingOrderId),
      with: {
        item: { with: { unit: true } },
        supplier: true,
        warehouse: true,
        productionJob: true,
        creatorBy: true,
        posterBy: true,
        receipts: true,
      },
    });

    if (!order) {
      throw new AppException(ErrorCode.E165, HttpStatus.NOT_FOUND);
    }

    const receivedQuantity = await getReceivedQuantityByOutsourcingOrderId(
      this.db,
      {
        outsourcingOrderId,
        statuses: [InventoryDocumentStatus.POSTED],
      },
    );

    return plainToInstance(
      OutsourcingOrderResDto,
      {
        ...order,
        receivedQuantity,
        progress: this.resolveOrderProgress(
          order.status,
          order.quantity,
          receivedQuantity,
        ),
      },
      { excludeExtraneousValues: true },
    );
  }

  async createOutsourcingOrder(
    reqDto: CreateOutsourcingOrderReqDto,
    userId: string,
  ): Promise<OutsourcingOrderResDto> {
    await this.warehousesService.ensureWarehouseActive(reqDto.warehouseId);
    await this.ensureSupplierExists(reqDto.supplierId);
    const source = await this.resolveJobOperationSource(
      reqDto.productionJobOperationId,
    );

    const code = await this.generateOutsourcingOrderCode(this.db);

    const [order] = await this.db
      .insert(outsourcingOrders)
      .values({
        ...reqDto,
        code,
        itemId: source.itemId,
        productionJobId: source.productionJobId,
        operationId: source.operationId,
        operationCode: source.operationCode,
        operationName: source.operationName,
        createdBy: userId,
      })
      .returning({ id: outsourcingOrders.id });

    return this.getOutsourcingOrder(order.id);
  }

  async postOutsourcingOrder(
    outsourcingOrderId: string,
    userId: string,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const row = await this.lockOutsourcingOrder(tx, outsourcingOrderId);

      if (row.status !== InventoryDocumentStatus.DRAFT) {
        throw new AppException(ErrorCode.E098, HttpStatus.CONFLICT);
      }

      await this.inventoryPostingService.postDocument(tx, {
        warehouseId: row.warehouseId,
        referenceType: InventoryReferenceType.OUTSOURCING_ORDER,
        referenceId: row.id,
        transactionDate: row.sendDate,
        createdBy: userId,
        lines: [
          {
            itemId: row.itemId,
            // Gửi đi luôn trừ tồn — dấu âm.
            signedQuantity: -row.quantity,
            type: InventoryTransactionType.ISSUE,
          },
        ],
      });

      await tx
        .update(outsourcingOrders)
        .set({
          status: InventoryDocumentStatus.POSTED,
          postedBy: userId,
          postedAt: new Date(),
        })
        .where(eq(outsourcingOrders.id, outsourcingOrderId));
    });
  }

  async cancelOutsourcingOrder(
    outsourcingOrderId: string,
    userId: string,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const row = await this.lockOutsourcingOrder(tx, outsourcingOrderId);

      if (row.status === InventoryDocumentStatus.CANCELLED) {
        throw new AppException(ErrorCode.E098, HttpStatus.CONFLICT);
      }

      if (row.status === InventoryDocumentStatus.POSTED) {
        const hasActiveReceipts = await this.hasActiveReceipts(
          tx,
          outsourcingOrderId,
        );
        if (hasActiveReceipts) {
          throw new AppException(ErrorCode.E169, HttpStatus.CONFLICT);
        }

        await this.inventoryPostingService.reverseDocument(tx, {
          referenceType: InventoryReferenceType.OUTSOURCING_ORDER,
          referenceId: outsourcingOrderId,
          transactionDate: new Date(),
          createdBy: userId,
        });
      }

      await tx
        .update(outsourcingOrders)
        .set({ status: InventoryDocumentStatus.CANCELLED })
        .where(eq(outsourcingOrders.id, outsourcingOrderId));
    });
  }

  /** Suy `itemId`/`productionJobId`/`operationCode`/`operationName` từ công đoạn as-used của Job —
   * bắt buộc snapshot `type = OUTSOURCE` (`E166`) và Job đang `IN_PROGRESS` (`E167`); BOM node mất
   * `itemId` (item gốc đã xoá) thì không suy được mặt hàng để ghi bút toán (`E168`). */
  private async resolveJobOperationSource(
    productionJobOperationId: string,
  ): Promise<{
    productionJobId: string;
    operationId: string | null;
    operationCode: string;
    operationName: string;
    itemId: string;
  }> {
    const found = await this.db.query.productionJobOperations.findFirst({
      where: eq(productionJobOperations.id, productionJobOperationId),
      with: { productionJob: true, bomItem: true },
    });

    if (!found) {
      throw new AppException(ErrorCode.E091, HttpStatus.NOT_FOUND);
    }

    const row = found as ProductionJobOperationSource;

    if (row.type !== OperationType.OUTSOURCE) {
      throw new AppException(ErrorCode.E166, HttpStatus.BAD_REQUEST);
    }
    if (row.productionJob.status !== ProductionJobStatus.IN_PROGRESS) {
      throw new AppException(ErrorCode.E167, HttpStatus.CONFLICT);
    }
    if (!row.bomItem.itemId) {
      throw new AppException(ErrorCode.E168, HttpStatus.BAD_REQUEST);
    }

    return {
      productionJobId: row.productionJobId,
      operationId: row.operationId,
      operationCode: row.code,
      operationName: row.name,
      itemId: row.bomItem.itemId,
    };
  }

  private async ensureSupplierExists(supplierId: string): Promise<void> {
    const existing = await this.db.query.suppliers.findFirst({
      columns: { id: true },
      where: and(eq(suppliers.id, supplierId), isNull(suppliers.deletedAt)),
    });

    if (!existing) {
      throw new AppException(ErrorCode.E019, HttpStatus.NOT_FOUND);
    }
  }

  /** Huỷ OS-OUT đã `POSTED` bị chặn (`E169`) nếu còn `outsourcing_receipts` nào chưa `CANCELLED` —
   * phải huỷ hết OS-IN con trước. */
  private async hasActiveReceipts(
    tx: DbTransaction,
    outsourcingOrderId: string,
  ): Promise<boolean> {
    const [{ total }] = await tx
      .select({ total: count() })
      .from(outsourcingReceipts)
      .where(
        and(
          eq(outsourcingReceipts.outsourcingOrderId, outsourcingOrderId),
          ne(outsourcingReceipts.status, InventoryDocumentStatus.CANCELLED),
        ),
      );

    return total > 0;
  }

  /** Khoá dòng phiếu (`FOR UPDATE`) rồi trả về — chỉ gọi bên trong transaction, cùng lý do
   * `InventoryIssuesService.lockIssue`: chặn `post`/`cancel` trùng lên cùng phiếu hai lần. */
  private async lockOutsourcingOrder(
    tx: DbTransaction,
    outsourcingOrderId: string,
  ) {
    const [row] = await tx
      .select()
      .from(outsourcingOrders)
      .where(eq(outsourcingOrders.id, outsourcingOrderId))
      .for('update');

    if (!row) {
      throw new AppException(ErrorCode.E165, HttpStatus.NOT_FOUND);
    }

    return row;
  }

  private async generateOutsourcingOrderCode(
    db: Database | DbTransaction,
  ): Promise<string> {
    const [totalRows] = await db
      .select({ total: count() })
      .from(outsourcingOrders);
    return `OS-OUT-${String((totalRows?.total ?? 0) + 1).padStart(4, '0')}`;
  }
}
