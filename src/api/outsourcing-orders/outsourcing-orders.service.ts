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
  isNull,
  lt,
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
  type OutsourcingOrderItemSelect,
  outsourcingOrderItems,
  outsourcingOrders,
  productionJobBomItems,
  productionJobOperations,
  productionJobs,
  ProductionJobStatus,
  suppliers,
  units,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { InventoryPostingService } from '../inventory/inventory-posting.service';
import { getReceivedQuantityByOrderItemIds } from '../outsourcing-receipts/outsourcing-receipts.query';
import { WarehousesService } from '../warehouses/warehouses.service';
import { CreateOutsourcingOrderReqDto } from './dto/create-outsourcing-order.req.dto';
import { GetOutsourceableOperationsReqDto } from './dto/get-outsourceable-operations.req.dto';
import { GetOutsourcingOrdersReqDto } from './dto/get-outsourcing-orders.req.dto';
import { OutsourceableOperationResDto } from './dto/outsourceable-operation.res.dto';
import { OutsourcingOrderItemReqDto } from './dto/outsourcing-order-item.req.dto';
import { OutsourcingOrderResDto } from './dto/outsourcing-order.res.dto';
import { PageOutsourcingOrderResDto } from './dto/page-outsourcing-order.res.dto';
import { OutsourcingOrderProgress } from './outsourcing-orders.constant';
import {
  getPlannedQuantitiesByJob,
  getSentQuantityByJobOperationIds,
  hasActiveReceiptsForOrder,
  hasPendingIqcForOrder,
  orderLineStatsSubquery,
  orderPendingIqcSubquery,
  sentQuantityByJobOperationSubquery,
} from './outsourcing-orders.query';
import type { OutsourcingOrderDetail } from './types/outsourcing-order-detail.type';
import type {
  ProductionJobOperationSource,
  ProductionJobOperationWithJob,
  ResolvedJobOperation,
} from './types/production-job-operation-source.type';

type OrderProgressStats = {
  sentQuantity: number;
  receivedQuantity: number;
  openLineCount: number;
  receivedLineCount: number;
  hasPendingIqc: boolean;
};

type OrderProgressSqlRefs = {
  sentQuantity: SQL<number>;
  receivedQuantity: SQL<number>;
  openLineCount: SQL<number>;
  receivedLineCount: SQL<number>;
  hasPendingIqc: SQL<boolean>;
};

type ResolvedOrderItem = {
  productionJobId: string | null;
  productionJobOperationId: string;
  operationId: string | null;
  operationCode: string;
  operationName: string;
  itemId: string;
  quantity: number;
  plannedQuantity: number;
  sentBeforeQuantity: number;
  weight: number | null;
  area: number | null;
  note: string | null;
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

    const lineStats = orderLineStatsSubquery(this.db);
    const pendingIqc = orderPendingIqcSubquery(this.db);
    const refs = this.buildProgressSqlRefs(lineStats, pendingIqc);

    const where = and(
      keyword ? unaccentILike(outsourcingOrders.code, keyword) : undefined,
      reqDto.supplierId
        ? eq(outsourcingOrders.supplierId, reqDto.supplierId)
        : undefined,
      reqDto.warehouseId
        ? eq(outsourcingOrders.warehouseId, reqDto.warehouseId)
        : undefined,
      reqDto.productionJobId
        ? this.orderHasItemMatching(
            eq(outsourcingOrderItems.productionJobId, reqDto.productionJobId),
          )
        : undefined,
      reqDto.operationId
        ? this.orderHasItemMatching(
            eq(outsourcingOrderItems.operationId, reqDto.operationId),
          )
        : undefined,
      reqDto.status ? eq(outsourcingOrders.status, reqDto.status) : undefined,
      reqDto.progress
        ? this.buildProgressCondition(refs, reqDto.progress)
        : undefined,
      materialKeyword
        ? exists(
            this.db
              .select({ one: sql`1` })
              .from(outsourcingOrderItems)
              .innerJoin(items, eq(items.id, outsourcingOrderItems.itemId))
              .where(
                and(
                  eq(
                    outsourcingOrderItems.outsourcingOrderId,
                    outsourcingOrders.id,
                  ),
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

    // Bước 1: lọc/phân trang trên bảng gốc (join 2 subquery thống kê dòng), chưa hydrate quan hệ —
    // `progress` suy từ SL từng dòng, không lọc được bằng relational query API.
    const [idRows, countRows] = await Promise.all([
      this.db
        .select({
          id: outsourcingOrders.id,
          totalQuantity: refs.sentQuantity,
          receivedQuantity: refs.receivedQuantity,
          openLineCount: refs.openLineCount,
          receivedLineCount: refs.receivedLineCount,
          hasPendingIqc: refs.hasPendingIqc,
        })
        .from(outsourcingOrders)
        .leftJoin(
          lineStats,
          eq(lineStats.outsourcingOrderId, outsourcingOrders.id),
        )
        .leftJoin(
          pendingIqc,
          eq(pendingIqc.outsourcingOrderId, outsourcingOrders.id),
        )
        .where(where)
        .orderBy(desc(outsourcingOrders.createdAt))
        .limit(reqDto.limit)
        .offset(reqDto.offset),
      this.db
        .select({ total: count() })
        .from(outsourcingOrders)
        .leftJoin(
          lineStats,
          eq(lineStats.outsourcingOrderId, outsourcingOrders.id),
        )
        .leftJoin(
          pendingIqc,
          eq(pendingIqc.outsourcingOrderId, outsourcingOrders.id),
        )
        .where(where),
    ]);

    const ids = idRows.map((row) => row.id);

    // Bước 2: hydrate quan hệ — chỉ cho đúng trang hiện tại. Cast tường minh
    // (`OutsourcingOrderDetail`) — nesting `items -> item -> unit` vượt độ sâu suy kiểu an toàn
    // của Drizzle (`.claude/rules/service.md`).
    const entities = (
      ids.length
        ? await this.db.query.outsourcingOrders.findMany({
            where: inArray(outsourcingOrders.id, ids),
            with: {
              supplier: true,
              warehouse: true,
              creatorBy: true,
              items: {
                orderBy: asc(outsourcingOrderItems.sortOrder),
                with: { item: { with: { unit: true } }, productionJob: true },
              },
            },
          })
        : []
    ) as OutsourcingOrderDetail[];

    const itemReceivedMap = await getReceivedQuantityByOrderItemIds(this.db, {
      orderItemIds: entities.flatMap((entity) =>
        entity.items.map((item) => item.id),
      ),
      statuses: [InventoryDocumentStatus.POSTED],
    });

    const entityById = new Map(entities.map((entity) => [entity.id, entity]));

    // Giữ đúng thứ tự đã sắp/phân trang ở bước 1 — `findMany` không đảm bảo giữ thứ tự `inArray`.
    const rows = idRows.flatMap((row) => {
      const entity = entityById.get(row.id);
      if (!entity) return [];
      return [
        {
          ...entity,
          totalQuantity: row.totalQuantity,
          progress: this.resolveOrderProgress(entity.status, {
            sentQuantity: row.totalQuantity,
            receivedQuantity: row.receivedQuantity,
            openLineCount: row.openLineCount,
            receivedLineCount: row.receivedLineCount,
            hasPendingIqc: row.hasPendingIqc,
          }),
          items: entity.items.map((item) => ({
            ...item,
            receivedQuantity: itemReceivedMap.get(item.id) ?? 0,
          })),
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

  async getOutsourcingOrder(
    outsourcingOrderId: string,
  ): Promise<OutsourcingOrderResDto> {
    const order = await this.db.query.outsourcingOrders.findFirst({
      where: eq(outsourcingOrders.id, outsourcingOrderId),
      with: {
        supplier: true,
        warehouse: true,
        creatorBy: true,
        posterBy: true,
        items: {
          orderBy: asc(outsourcingOrderItems.sortOrder),
          with: { item: { with: { unit: true } }, productionJob: true },
        },
      },
    });

    if (!order) {
      throw new AppException(ErrorCode.E165, HttpStatus.NOT_FOUND);
    }

    return plainToInstance(OutsourcingOrderResDto, order, {
      excludeExtraneousValues: true,
    });
  }

  async getOutsourceableOperations(
    reqDto: GetOutsourceableOperationsReqDto,
  ): Promise<OffsetPaginatedDto<OutsourceableOperationResDto>> {
    const keyword = reqDto.q ? `%${reqDto.q}%` : undefined;

    const where = and(
      eq(productionJobOperations.type, OperationType.OUTSOURCE),
      eq(productionJobs.status, ProductionJobStatus.IN_PROGRESS),
      reqDto.productionJobId
        ? eq(productionJobs.id, reqDto.productionJobId)
        : undefined,
      reqDto.operationId
        ? eq(productionJobOperations.operationId, reqDto.operationId)
        : undefined,
      keyword
        ? or(
            unaccentILike(productionJobs.code, keyword),
            unaccentILike(productionJobBomItems.code, keyword),
            unaccentILike(productionJobBomItems.name, keyword),
            unaccentILike(productionJobOperations.code, keyword),
            unaccentILike(productionJobOperations.name, keyword),
          )
        : undefined,
    );

    const sentQuantityByJobOperation = sentQuantityByJobOperationSubquery(
      this.db,
    );

    const [operations, [{ total }]] = await Promise.all([
      this.db
        .select({
          productionJobOperationId: productionJobOperations.id,
          operation: getTableColumns(productionJobOperations),
          job: getTableColumns(productionJobs),
          part: getTableColumns(productionJobBomItems),
          unit: getTableColumns(units),
          sentQuantity:
            sql<number>`coalesce(${sentQuantityByJobOperation.sentQuantity}, 0)`.mapWith(
              Number,
            ),
        })
        .from(productionJobOperations)
        .innerJoin(
          productionJobs,
          eq(productionJobs.id, productionJobOperations.productionJobId),
        )
        .innerJoin(
          productionJobBomItems,
          eq(
            productionJobBomItems.id,
            productionJobOperations.productionJobBomItemId,
          ),
        )
        .innerJoin(
          items,
          and(
            eq(items.id, productionJobBomItems.itemId),
            isNull(items.deletedAt),
          ),
        )
        .innerJoin(units, eq(units.id, items.unitId))
        .leftJoin(
          sentQuantityByJobOperation,
          eq(
            sentQuantityByJobOperation.productionJobOperationId,
            productionJobOperations.id,
          ),
        )
        .where(where)
        .orderBy(
          asc(productionJobs.code),
          asc(productionJobBomItems.sortOrder),
          asc(productionJobOperations.sortOrder),
        )
        .limit(reqDto.limit)
        .offset(reqDto.offset),
      this.db
        .select({ total: count() })
        .from(productionJobOperations)
        .innerJoin(
          productionJobs,
          eq(productionJobs.id, productionJobOperations.productionJobId),
        )
        .innerJoin(
          productionJobBomItems,
          eq(
            productionJobBomItems.id,
            productionJobOperations.productionJobBomItemId,
          ),
        )
        .innerJoin(
          items,
          and(
            eq(items.id, productionJobBomItems.itemId),
            isNull(items.deletedAt),
          ),
        )
        .innerJoin(units, eq(units.id, items.unitId))
        .where(where),
    ]);

    // `plannedQuantity` phụ thuộc cả cây BOM của Job — không tính được bằng 1 câu SQL phẳng, chỉ
    // tính cho đúng trang hiện tại (đã phân trang ở bước SQL trên). `sentQuantity` đã có sẵn từ
    // SELECT (LEFT JOIN `sentQuantityByJobOperation`), không cần round-trip riêng.
    const plannedByJob = await getPlannedQuantitiesByJob(
      this.db,
      new Map(operations.map((row) => [row.job.id, row.job.quantity])),
    );

    const rows = operations.map((row) => {
      const plannedQuantity =
        plannedByJob.get(row.job.id)?.get(row.part.id) ?? 0;
      return {
        ...row,
        plannedQuantity,
        remainingQuantity: plannedQuantity - row.sentQuantity,
      };
    });

    return new OffsetPaginatedDto(
      plainToInstance(OutsourceableOperationResDto, rows, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(total, reqDto),
    );
  }

  /** Không còn nháp — tạo là gửi luôn: resolve/validate xong thì `INSERT` header thẳng `POSTED` và
   * trừ tồn trong cùng transaction (gộp logic `post` cũ), không qua bước `DRAFT` trung gian nào.
   * `excludeOrderId: order.id` ở `ensurePersistedItemsWithinPlanned` bắt buộc phải giữ — xem comment
   * ở đó. */
  async createOutsourcingOrder(
    reqDto: CreateOutsourcingOrderReqDto,
    userId: string,
  ): Promise<void> {
    await this.warehousesService.ensureWarehouseActive(reqDto.warehouseId);
    await this.ensureSupplierExists(reqDto.supplierId);

    const resolvedItems = await this.resolveAndValidateItems(reqDto.items);

    const code = await this.generateOutsourcingOrderCode();
    const { items: _items, ...orderFields } = reqDto;

    await this.db.transaction(async (tx) => {
      const [order] = await tx
        .insert(outsourcingOrders)
        .values({
          ...orderFields,
          code,
          createdBy: userId,
          status: InventoryDocumentStatus.POSTED,
          postedBy: userId,
          postedAt: new Date(),
        })
        .returning();

      const lineItems = await tx
        .insert(outsourcingOrderItems)
        .values(
          resolvedItems.map((item, index) => ({
            ...item,
            outsourcingOrderId: order.id,
            sortOrder: index,
          })),
        )
        .returning();

      await this.ensurePersistedItemsWithinPlanned(tx, order.id, lineItems);

      await this.inventoryPostingService.postDocument(tx, {
        warehouseId: order.warehouseId,
        referenceType: InventoryReferenceType.OUTSOURCING_ORDER,
        referenceId: order.id,
        transactionDate: order.sendDate,
        createdBy: userId,
        lines: lineItems.map((item) => ({
          itemId: item.itemId,
          // Gửi đi luôn trừ tồn — dấu âm.
          signedQuantity: -item.quantity,
          type: InventoryTransactionType.ISSUE,
        })),
      });
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
        const hasActiveReceipts = await hasActiveReceiptsForOrder(
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

  /** SL sống (không đọc cột snapshot `plannedQuantity`/`sentBeforeQuantity`) của mọi dòng một
   * phiếu — dùng chung cho `getOutsourcingOrder` và (gián tiếp, qua bước 1 SQL) `getOutsourcingOrders`. */
  private async resolveOrderStats(
    outsourcingOrderId: string,
    lineItems: { id: string; quantity: number }[],
  ): Promise<OrderProgressStats & { receivedByItemId: Map<string, number> }> {
    const [receivedByItemId, hasPendingIqc] = await Promise.all([
      getReceivedQuantityByOrderItemIds(this.db, {
        orderItemIds: lineItems.map((item) => item.id),
        statuses: [InventoryDocumentStatus.POSTED],
      }),
      hasPendingIqcForOrder(this.db, outsourcingOrderId),
    ]);

    const sentQuantity = lineItems.reduce(
      (sum, item) => sum + item.quantity,
      0,
    );
    const receivedQuantity = lineItems.reduce(
      (sum, item) => sum + (receivedByItemId.get(item.id) ?? 0),
      0,
    );
    const openLineCount = lineItems.filter(
      (item) => (receivedByItemId.get(item.id) ?? 0) < item.quantity,
    ).length;
    const receivedLineCount = lineItems.filter(
      (item) => (receivedByItemId.get(item.id) ?? 0) > 0,
    ).length;

    return {
      sentQuantity,
      receivedQuantity,
      openLineCount,
      receivedLineCount,
      hasPendingIqc,
      receivedByItemId,
    };
  }

  private orderHasItemMatching(condition: SQL): SQL {
    return exists(
      this.db
        .select({ one: sql`1` })
        .from(outsourcingOrderItems)
        .where(
          and(
            eq(outsourcingOrderItems.outsourcingOrderId, outsourcingOrders.id),
            condition,
          ),
        ),
    );
  }

  private buildProgressSqlRefs(
    lineStats: ReturnType<typeof orderLineStatsSubquery>,
    pendingIqc: ReturnType<typeof orderPendingIqcSubquery>,
  ): OrderProgressSqlRefs {
    return {
      sentQuantity: sql<number>`coalesce(${lineStats.sentQuantity}, 0)`.mapWith(
        Number,
      ),
      receivedQuantity:
        sql<number>`coalesce(${lineStats.receivedQuantity}, 0)`.mapWith(Number),
      openLineCount:
        sql<number>`coalesce(${lineStats.openLineCount}, 0)`.mapWith(Number),
      receivedLineCount:
        sql<number>`coalesce(${lineStats.receivedLineCount}, 0)`.mapWith(
          Number,
        ),
      hasPendingIqc: sql<boolean>`(${pendingIqc.outsourcingOrderId} is not null)`,
    };
  }

  /** Cùng thứ tự ưu tiên với `buildProgressCondition` (sửa một cái phải sửa cái kia). Chỉ xét
   * `WAITING_QC`/`COMPLETED` khi mọi dòng đã nhận đủ (`openLineCount = 0`) — nhận thiếu luôn ưu
   * tiên `PARTIAL`/`SENT`. */
  private resolveOrderProgress(
    status: InventoryDocumentStatus,
    stats: OrderProgressStats,
  ): OutsourcingOrderProgress {
    if (status === InventoryDocumentStatus.CANCELLED) {
      return OutsourcingOrderProgress.CANCELLED;
    }
    if (status === InventoryDocumentStatus.DRAFT) {
      return OutsourcingOrderProgress.DRAFT;
    }
    if (stats.openLineCount > 0) {
      return stats.receivedLineCount > 0
        ? OutsourcingOrderProgress.PARTIAL
        : OutsourcingOrderProgress.SENT;
    }
    return stats.hasPendingIqc
      ? OutsourcingOrderProgress.WAITING_QC
      : OutsourcingOrderProgress.COMPLETED;
  }

  private buildProgressCondition(
    refs: OrderProgressSqlRefs,
    progress: OutsourcingOrderProgress,
  ): SQL {
    switch (progress) {
      case OutsourcingOrderProgress.CANCELLED:
        return eq(outsourcingOrders.status, InventoryDocumentStatus.CANCELLED);
      case OutsourcingOrderProgress.DRAFT:
        return eq(outsourcingOrders.status, InventoryDocumentStatus.DRAFT);
      case OutsourcingOrderProgress.SENT:
        return sql`(
          ${outsourcingOrders.status} = ${InventoryDocumentStatus.POSTED}
          and ${refs.openLineCount} > 0
          and ${refs.receivedLineCount} = 0
        )`;
      case OutsourcingOrderProgress.PARTIAL:
        return sql`(
          ${outsourcingOrders.status} = ${InventoryDocumentStatus.POSTED}
          and ${refs.openLineCount} > 0
          and ${refs.receivedLineCount} > 0
        )`;
      case OutsourcingOrderProgress.WAITING_QC:
        return sql`(
          ${outsourcingOrders.status} = ${InventoryDocumentStatus.POSTED}
          and ${refs.openLineCount} = 0
          and ${refs.hasPendingIqc}
        )`;
      case OutsourcingOrderProgress.COMPLETED:
        return sql`(
          ${outsourcingOrders.status} = ${InventoryDocumentStatus.POSTED}
          and ${refs.openLineCount} = 0
          and not ${refs.hasPendingIqc}
        )`;
    }
  }

  /** Suy `itemId`/`productionJobId`/`operationCode`/`operationName`/`productionJobBomItemId`
   * (dùng để tính `plannedQuantity`)/`jobQuantity` từ công đoạn as-used của Job — bắt buộc snapshot
   * `type = OUTSOURCE` (`E166`) và Job đang `IN_PROGRESS` (`E167`); BOM node mất `itemId` (item gốc
   * đã xoá) thì không suy được mặt hàng để ghi bút toán (`E168`). */
  private async resolveJobOperationSources(
    productionJobOperationIds: string[],
  ): Promise<Map<string, ResolvedJobOperation>> {
    const rows = (await this.db.query.productionJobOperations.findMany({
      where: inArray(productionJobOperations.id, productionJobOperationIds),
      with: { productionJob: true, bomItem: true },
    })) as ProductionJobOperationSource[];
    const rowById = new Map(rows.map((row) => [row.id, row]));

    const sources = new Map<string, ResolvedJobOperation>();

    // Kiểm tuần tự theo đúng thứ tự id truyền vào — dòng hỏng đầu tiên quyết định mã lỗi trả về.
    for (const productionJobOperationId of productionJobOperationIds) {
      const row = rowById.get(productionJobOperationId);

      if (!row) {
        throw new AppException(ErrorCode.E091, HttpStatus.NOT_FOUND);
      }
      if (row.type !== OperationType.OUTSOURCE) {
        throw new AppException(ErrorCode.E166, HttpStatus.BAD_REQUEST);
      }
      if (row.productionJob.status !== ProductionJobStatus.IN_PROGRESS) {
        throw new AppException(ErrorCode.E167, HttpStatus.CONFLICT);
      }
      if (!row.bomItem.itemId) {
        throw new AppException(ErrorCode.E168, HttpStatus.BAD_REQUEST);
      }

      sources.set(productionJobOperationId, {
        productionJobId: row.productionJobId,
        productionJobBomItemId: row.productionJobBomItemId,
        jobQuantity: row.productionJob.quantity,
        operationId: row.operationId,
        operationCode: row.code,
        operationName: row.name,
        itemId: row.bomItem.itemId,
      });
    }

    return sources;
  }

  /** Resolve + validate toàn bộ dòng của payload create: rỗng (`E182`), trùng công đoạn (`E183`),
   * rồi từng dòng qua `resolveJobOperationSources` + chặn gửi vượt định mức (`E184`, tính trên
   * `POSTED` — không còn phiếu nào ở `DRAFT` để cộng dồn). Đây là lượt kiểm mềm, chạy trước khi
   * phiếu tồn tại; `ensurePersistedItemsWithinPlanned` mới là chốt chặn thật trên dữ liệu sống. */
  private async resolveAndValidateItems(
    items: OutsourcingOrderItemReqDto[],
  ): Promise<ResolvedOrderItem[]> {
    if (!items.length) {
      throw new AppException(ErrorCode.E182, HttpStatus.BAD_REQUEST);
    }

    const operationIds = items.map((item) => item.productionJobOperationId);
    if (new Set(operationIds).size !== operationIds.length) {
      throw new AppException(ErrorCode.E183, HttpStatus.BAD_REQUEST);
    }

    const sources = await this.resolveJobOperationSources([
      ...new Set(operationIds),
    ]);

    const plannedByJob = await getPlannedQuantitiesByJob(
      this.db,
      new Map(
        [...sources.values()].map((source) => [
          source.productionJobId,
          source.jobQuantity,
        ]),
      ),
    );

    const sentMap = await getSentQuantityByJobOperationIds(this.db, {
      productionJobOperationIds: [...new Set(operationIds)],
      statuses: [InventoryDocumentStatus.POSTED],
    });

    return items.map((item) => {
      const source = sources.get(item.productionJobOperationId)!;
      const plannedQuantity =
        plannedByJob
          .get(source.productionJobId)
          ?.get(source.productionJobBomItemId) ?? 0;
      const sentBeforeQuantity =
        sentMap.get(item.productionJobOperationId) ?? 0;

      if (sentBeforeQuantity + item.quantity > plannedQuantity) {
        throw new AppException(ErrorCode.E184, HttpStatus.BAD_REQUEST);
      }

      return {
        productionJobId: source.productionJobId,
        productionJobOperationId: item.productionJobOperationId,
        operationId: source.operationId,
        operationCode: source.operationCode,
        operationName: source.operationName,
        itemId: source.itemId,
        quantity: item.quantity,
        plannedQuantity,
        sentBeforeQuantity,
        weight: item.weight ?? null,
        area: item.area ?? null,
        note: item.note ?? null,
      };
    });
  }

  /** Chốt chặn thật của `E184`, chạy trong transaction `create` trên dữ liệu vừa insert — khác lượt
   * kiểm mềm ở `resolveAndValidateItems` (chạy trước khi phiếu tồn tại). `excludeOrderId` bắt buộc
   * phải truyền = chính phiếu đang tạo — header đã `INSERT` với `POSTED` ngay trong transaction này
   * nên `tx` nhìn thấy chính dòng của nó, không loại sẽ bị cộng dồn hai lần vào `sentMap`. Bỏ qua
   * dòng đã mất `productionJobOperationId` (Job bị hard-delete) — không còn gì để đối chiếu. */
  private async ensurePersistedItemsWithinPlanned(
    tx: DbTransaction,
    outsourcingOrderId: string,
    lineItems: OutsourcingOrderItemSelect[],
  ): Promise<void> {
    const relevant = lineItems.filter(
      (
        item,
      ): item is OutsourcingOrderItemSelect & {
        productionJobOperationId: string;
      } => item.productionJobOperationId !== null,
    );
    if (!relevant.length) {
      return;
    }

    const operationRows = (await tx.query.productionJobOperations.findMany({
      where: inArray(
        productionJobOperations.id,
        relevant.map((item) => item.productionJobOperationId),
      ),
      with: { productionJob: true },
    })) as ProductionJobOperationWithJob[];
    const opById = new Map(operationRows.map((op) => [op.id, op]));

    const plannedByJob = await getPlannedQuantitiesByJob(
      tx,
      new Map(
        operationRows.map((op) => [
          op.productionJobId,
          op.productionJob.quantity,
        ]),
      ),
    );

    const sentMap = await getSentQuantityByJobOperationIds(tx, {
      productionJobOperationIds: relevant.map(
        (item) => item.productionJobOperationId,
      ),
      statuses: [InventoryDocumentStatus.POSTED],
      excludeOrderId: outsourcingOrderId,
    });

    for (const item of relevant) {
      const op = opById.get(item.productionJobOperationId);
      if (!op) {
        continue;
      }
      const planned =
        plannedByJob.get(op.productionJobId)?.get(op.productionJobBomItemId) ??
        0;
      const sentBefore = sentMap.get(item.productionJobOperationId) ?? 0;

      if (sentBefore + item.quantity > planned) {
        throw new AppException(ErrorCode.E184, HttpStatus.BAD_REQUEST);
      }
    }
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

  /** Khoá dòng phiếu (`FOR UPDATE`) rồi trả về — chỉ gọi bên trong transaction, cùng lý do
   * `InventoryIssuesService.lockIssue`: chặn `cancel` gọi trùng lên cùng phiếu hai lần. */
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

  private async generateOutsourcingOrderCode(): Promise<string> {
    const [totalRows] = await this.db
      .select({ total: count() })
      .from(outsourcingOrders);
    return `OS-OUT-${String((totalRows?.total ?? 0) + 1).padStart(4, '0')}`;
  }
}
