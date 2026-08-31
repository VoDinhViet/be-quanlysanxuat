import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  isNull,
  or,
  sql,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

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
  OperationType,
  OutsourcingOrderStatus,
  outsourcingOrderItems,
  outsourcingOrders,
  productionJobBomItems,
  productionJobOperations,
  productionJobs,
  ProductionJobStatus,
  suppliers,
  units,
  users,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import { receivedQuantityByOrderItemIdSubquery } from '../outsourcing-receipts/outsourcing-receipts.query';
import { CreateOutsourcingOrderReqDto } from './dto/create-outsourcing-order.req.dto';
import { GetOutsourceableOperationsReqDto } from './dto/get-outsourceable-operations.req.dto';
import { GetOutsourcingOrdersReqDto } from './dto/get-outsourcing-orders.req.dto';
import { OutsourceableOperationResDto } from './dto/outsourceable-operation.res.dto';
import { OutsourcingOrderItemReqDto } from './dto/outsourcing-order-item.req.dto';
import { OutsourcingOrderItemResDto } from './dto/outsourcing-order-item.res.dto';
import { OutsourcingOrderResDto } from './dto/outsourcing-order.res.dto';
import { PageOutsourcingOrderResDto } from './dto/page-outsourcing-order.res.dto';
import {
  hasActiveReceiptsForOrder,
  receivedQuantityByOrderIdSubquery,
  sentQuantityByJobOperationSubquery,
  sentQuantityByOrderIdSubquery,
} from './outsourcing-orders.query';

@Injectable()
export class OutsourcingOrdersService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async getOutsourcingOrders(
    reqDto: GetOutsourcingOrdersReqDto,
  ): Promise<OffsetPaginatedDto<PageOutsourcingOrderResDto>> {
    const filters = and(
      reqDto.q
        ? unaccentILike(outsourcingOrders.code, `%${reqDto.q}%`)
        : undefined,
      reqDto.status ? eq(outsourcingOrders.status, reqDto.status) : undefined,
    );

    const sentQuantityByOrder = sentQuantityByOrderIdSubquery(this.db);
    const receivedQuantityByOrder = receivedQuantityByOrderIdSubquery(this.db);

    const [entities, [{ total }]] = await Promise.all([
      this.db
        .select({
          ...getTableColumns(outsourcingOrders),
          supplier: getTableColumns(suppliers),
          creatorBy: getTableColumns(users),
          totalQuantity:
            sql<number>`coalesce(${sentQuantityByOrder.totalQuantity}, 0)`.mapWith(
              Number,
            ),
          receivedQuantity:
            sql<number>`coalesce(${receivedQuantityByOrder.receivedQuantity}, 0)`.mapWith(
              Number,
            ),
          remainingQuantity:
            sql<number>`coalesce(${sentQuantityByOrder.totalQuantity}, 0) - coalesce(${receivedQuantityByOrder.receivedQuantity}, 0)`.mapWith(
              Number,
            ),
        })
        .from(outsourcingOrders)
        .innerJoin(suppliers, eq(suppliers.id, outsourcingOrders.supplierId))
        .leftJoin(users, eq(users.id, outsourcingOrders.createdBy))
        .leftJoin(
          sentQuantityByOrder,
          eq(sentQuantityByOrder.outsourcingOrderId, outsourcingOrders.id),
        )
        .leftJoin(
          receivedQuantityByOrder,
          eq(receivedQuantityByOrder.outsourcingOrderId, outsourcingOrders.id),
        )
        .where(filters)
        .orderBy(desc(outsourcingOrders.createdAt))
        .limit(reqDto.limit)
        .offset(reqDto.offset),
      this.db.select({ total: count() }).from(outsourcingOrders).where(filters),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(PageOutsourcingOrderResDto, entities, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(total, reqDto),
    );
  }

  async getOutsourcingOrder(
    outsourcingOrderId: string,
  ): Promise<OutsourcingOrderResDto> {
    // Hai JOIN riêng biệt vào cùng bảng `users` (creatorBy/posterBy) cần alias để không đụng nhau
    // trong cùng một query.
    const creatorUsers = alias(users, 'creator_users');
    const posterUsers = alias(users, 'poster_users');

    const sentQuantityByOrder = sentQuantityByOrderIdSubquery(this.db);
    const receivedQuantityByOrder = receivedQuantityByOrderIdSubquery(this.db);

    const [outsourcingOrder] = await this.db
      .select({
        ...getTableColumns(outsourcingOrders),
        supplier: getTableColumns(suppliers),
        creatorBy: getTableColumns(creatorUsers),
        posterBy: getTableColumns(posterUsers),
        totalQuantity:
          sql<number>`coalesce(${sentQuantityByOrder.totalQuantity}, 0)`.mapWith(
            Number,
          ),
        receivedQuantity:
          sql<number>`coalesce(${receivedQuantityByOrder.receivedQuantity}, 0)`.mapWith(
            Number,
          ),
        remainingQuantity:
          sql<number>`coalesce(${sentQuantityByOrder.totalQuantity}, 0) - coalesce(${receivedQuantityByOrder.receivedQuantity}, 0)`.mapWith(
            Number,
          ),
      })
      .from(outsourcingOrders)
      .innerJoin(suppliers, eq(suppliers.id, outsourcingOrders.supplierId))
      .leftJoin(creatorUsers, eq(creatorUsers.id, outsourcingOrders.createdBy))
      .leftJoin(posterUsers, eq(posterUsers.id, outsourcingOrders.postedBy))
      .leftJoin(
        sentQuantityByOrder,
        eq(sentQuantityByOrder.outsourcingOrderId, outsourcingOrders.id),
      )
      .leftJoin(
        receivedQuantityByOrder,
        eq(receivedQuantityByOrder.outsourcingOrderId, outsourcingOrders.id),
      )
      .where(eq(outsourcingOrders.id, outsourcingOrderId))
      .limit(1);

    if (!outsourcingOrder) {
      throw new AppException(ErrorCode.E165, HttpStatus.NOT_FOUND);
    }

    return plainToInstance(OutsourcingOrderResDto, outsourcingOrder, {
      excludeExtraneousValues: true,
    });
  }

  async getOrderItems(
    outsourcingOrderId: string,
  ): Promise<OutsourcingOrderItemResDto[]> {
    await this.ensureOutsourcingOrderExists(outsourcingOrderId);

    const receivedQuantityByItem = receivedQuantityByOrderItemIdSubquery(
      this.db,
    );

    const rows = await this.db
      .select({
        ...getTableColumns(outsourcingOrderItems),
        item: getTableColumns(items),
        unit: getTableColumns(units),
        productionJob: getTableColumns(productionJobs),
        receivedQuantity:
          sql<number>`coalesce(${receivedQuantityByItem.receivedQuantity}, 0)`.mapWith(
            Number,
          ),
      })
      .from(outsourcingOrderItems)
      .innerJoin(items, eq(items.id, outsourcingOrderItems.itemId))
      .innerJoin(units, eq(units.id, items.unitId))
      .leftJoin(
        productionJobs,
        eq(productionJobs.id, outsourcingOrderItems.productionJobId),
      )
      .leftJoin(
        receivedQuantityByItem,
        eq(
          receivedQuantityByItem.outsourcingOrderItemId,
          outsourcingOrderItems.id,
        ),
      )
      .where(eq(outsourcingOrderItems.outsourcingOrderId, outsourcingOrderId))
      .orderBy(asc(outsourcingOrderItems.sortOrder));

    return plainToInstance(OutsourcingOrderItemResDto, rows, {
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
          // Lấy từ `items.id` (innerJoin ⇒ non-null), KHÔNG lấy `productionJobBomItems.itemId` —
          // cột đó `set null` nên nullable, trong khi req DTO của dòng OS-OUT bắt buộc `itemId`.
          itemId: items.id,
          job: getTableColumns(productionJobs),
          bomItem: getTableColumns(productionJobBomItems),
          operation: getTableColumns(productionJobOperations),
          unit: getTableColumns(units),
          plannedQuantity: productionJobBomItems.plannedQuantity,
          sentQuantity:
            sql<number>`coalesce(${sentQuantityByJobOperation.sentQuantity}, 0)`.mapWith(
              Number,
            ),
          remainingQuantity:
            sql<number>`${productionJobBomItems.plannedQuantity} - coalesce(${sentQuantityByJobOperation.sentQuantity}, 0)`.mapWith(
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

    return new OffsetPaginatedDto(
      plainToInstance(OutsourceableOperationResDto, operations, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(total, reqDto),
    );
  }

  /** Không còn nháp — tạo là gửi luôn: `INSERT` header thẳng `SENT`, không qua bước `DRAFT` trung
   * gian nào. Không đụng `inventory_balances` — mặt hàng gửi gia công luôn là WIP, kho không quản
   * tồn WIP (`docs/decisions/wip-not-stocked.md`). Dòng do client gửi đủ cột (không resolve lại từ
   * `productionJobOperationId`), `docs/decisions/outsourcing-no-draft.md`. */
  async createOutsourcingOrder(
    reqDto: CreateOutsourcingOrderReqDto,
    userId: string,
  ): Promise<void> {
    await this.ensureSupplierExists(reqDto.supplierId);
    this.validateOrderItems(reqDto.items);

    const { items: reqItems, ...orderFields } = reqDto;

    await this.db.transaction(async (tx) => {
      const code = await this.generateOutsourcingOrderCode(tx);
      const [outsourcingOrder] = await tx
        .insert(outsourcingOrders)
        .values({
          ...orderFields,
          code,
          createdBy: userId,
          status: OutsourcingOrderStatus.SENT,
          postedBy: userId,
          postedAt: new Date(),
        })
        .returning({ id: outsourcingOrders.id });

      await tx.insert(outsourcingOrderItems).values(
        reqItems.map((item, index) => ({
          ...item,
          outsourcingOrderId: outsourcingOrder.id,
          sortOrder: index,
        })),
      );
    });
  }

  async cancelOutsourcingOrder(outsourcingOrderId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const outsourcingOrder = await this.getOutsourcingOrderForUpdate(
        tx,
        outsourcingOrderId,
      );

      if (outsourcingOrder.status === OutsourcingOrderStatus.CANCELLED) {
        throw new AppException(ErrorCode.E098, HttpStatus.CONFLICT);
      }

      // Mọi trạng thái khác CANCELLED đều "còn hoạt động" (status đã gộp tiến độ, không còn chỉ
      // POSTED — docs/decisions/outsourcing-order-status-progress-merge.md).
      const hasActiveReceipts = await hasActiveReceiptsForOrder(
        tx,
        outsourcingOrderId,
      );
      if (hasActiveReceipts) {
        throw new AppException(ErrorCode.E169, HttpStatus.CONFLICT);
      }

      await tx
        .update(outsourcingOrders)
        .set({ status: OutsourcingOrderStatus.CANCELLED })
        .where(eq(outsourcingOrders.id, outsourcingOrderId));
    });
  }

  private validateOrderItems(reqItems: OutsourcingOrderItemReqDto[]): void {
    if (!reqItems.length) {
      throw new AppException(ErrorCode.E182, HttpStatus.BAD_REQUEST);
    }

    const operationIds = reqItems.map((item) => item.productionJobOperationId);
    if (new Set(operationIds).size !== operationIds.length) {
      throw new AppException(ErrorCode.E183, HttpStatus.BAD_REQUEST);
    }
  }

  private async ensureOutsourcingOrderExists(
    outsourcingOrderId: string,
  ): Promise<void> {
    const existing = await this.db.query.outsourcingOrders.findFirst({
      columns: { id: true },
      where: eq(outsourcingOrders.id, outsourcingOrderId),
    });

    if (!existing) {
      throw new AppException(ErrorCode.E165, HttpStatus.NOT_FOUND);
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
   * `InventoryIssuesService.getInventoryIssueForUpdate`: chặn `cancel` gọi trùng lên cùng phiếu hai
   * lần. */
  private async getOutsourcingOrderForUpdate(
    tx: DbTransaction,
    outsourcingOrderId: string,
  ) {
    const [outsourcingOrder] = await tx
      .select()
      .from(outsourcingOrders)
      .where(eq(outsourcingOrders.id, outsourcingOrderId))
      .for('update');

    if (!outsourcingOrder) {
      throw new AppException(ErrorCode.E165, HttpStatus.NOT_FOUND);
    }

    return outsourcingOrder;
  }

  private async generateOutsourcingOrderCode(
    tx: DbTransaction,
  ): Promise<string> {
    const sequence = await generateDocumentSequence(
      tx,
      DocumentType.OUTSOURCING_ORDER,
    );

    return `OS-OUT-${String(sequence).padStart(4, '0')}`;
  }
}
