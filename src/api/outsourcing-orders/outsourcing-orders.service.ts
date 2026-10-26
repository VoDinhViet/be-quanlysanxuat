import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  inArray,
  isNull,
  ne,
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
  files,
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
import { RejectOutsourcingOrderReqDto } from './dto/reject-outsourcing-order.req.dto';
import {
  hasActiveReceiptsForOrder,
  receivedQuantityByOrderIdSubquery,
  sentQuantityByJobOperationSubquery,
  sentQuantityByOrderIdSubquery,
  sentQuantityByOtherOrdersSubquery,
} from './outsourcing-orders.query';

/** Trạng thái còn sửa được và gửi duyệt được. */
const EDITABLE_STATUSES: readonly OutsourcingOrderStatus[] = [
  OutsourcingOrderStatus.DRAFT,
  OutsourcingOrderStatus.REJECTED,
];

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
    // Nhiều JOIN vào cùng bảng `users` (creatorBy/posterBy/approverBy/rejecterBy) cần alias để không đụng tên.
    const creatorUsers = alias(users, 'creator_users');
    const posterUsers = alias(users, 'poster_users');
    const approverUsers = alias(users, 'approver_users');
    const rejecterUsers = alias(users, 'rejecter_users');

    const sentQuantityByOrder = sentQuantityByOrderIdSubquery(this.db);
    const receivedQuantityByOrder = receivedQuantityByOrderIdSubquery(this.db);

    const [outsourcingOrder] = await this.db
      .select({
        ...getTableColumns(outsourcingOrders),
        supplier: getTableColumns(suppliers),
        creatorBy: getTableColumns(creatorUsers),
        posterBy: getTableColumns(posterUsers),
        approverBy: getTableColumns(approverUsers),
        rejecterBy: getTableColumns(rejecterUsers),
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
        approverUsers,
        eq(approverUsers.id, outsourcingOrders.approvedBy),
      )
      .leftJoin(
        rejecterUsers,
        eq(rejecterUsers.id, outsourcingOrders.rejectedBy),
      )
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
    const sentByOtherOrders = sentQuantityByOtherOrdersSubquery(
      this.db,
      outsourcingOrderId,
    );

    const outsourcingOrderItemRows = await this.db
      .select({
        ...getTableColumns(outsourcingOrderItems),
        item: {
          ...getTableColumns(items),
          revision: sql<string>`coalesce(${productionJobBomItems.revision}, ${items.revision})`,
        },
        unit: getTableColumns(units),
        productionJob: getTableColumns(productionJobs),
        imageFile: getTableColumns(files),
        plannedQuantity: productionJobBomItems.plannedQuantity,
        receivedQuantity:
          sql<number>`coalesce(${receivedQuantityByItem.receivedQuantity}, 0)`.mapWith(
            Number,
          ),
        sentByOtherOrdersQuantity:
          sql<number>`coalesce(${sentByOtherOrders.sentQuantity}, 0)`.mapWith(
            Number,
          ),
      })
      .from(outsourcingOrderItems)
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
      .leftJoin(
        sentByOtherOrders,
        eq(
          sentByOtherOrders.productionJobOperationId,
          outsourcingOrderItems.productionJobOperationId,
        ),
      )
      .where(eq(outsourcingOrderItems.outsourcingOrderId, outsourcingOrderId))
      .orderBy(asc(outsourcingOrderItems.sortOrder));

    return plainToInstance(
      OutsourcingOrderItemResDto,
      outsourcingOrderItemRows,
      {
        excludeExtraneousValues: true,
      },
    );
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

    const sentQuantityByJobOperation = reqDto.excludeOutsourcingOrderId
      ? sentQuantityByOtherOrdersSubquery(
          this.db,
          reqDto.excludeOutsourcingOrderId,
        )
      : sentQuantityByJobOperationSubquery(this.db);

    const [operations, [{ total }]] = await Promise.all([
      this.db
        .select({
          productionJobOperationId: productionJobOperations.id,
          productionJobBomItemId: productionJobBomItems.id,
          // Nullable (node COMPONENT không phải item) — chỉ tham khảo; `bomItem.code`/`name` mới là
          // snapshot client gửi lại.
          itemId: productionJobBomItems.itemId,
          job: getTableColumns(productionJobs),
          bomItem: getTableColumns(productionJobBomItems),
          operation: getTableColumns(productionJobOperations),
          unit: getTableColumns(units),
          imageFile: getTableColumns(files),
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
        .leftJoin(
          items,
          and(
            eq(items.id, productionJobBomItems.itemId),
            isNull(items.deletedAt),
          ),
        )
        .leftJoin(units, eq(units.id, items.unitId))
        .leftJoin(files, eq(files.id, productionJobBomItems.imageFileId))
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
        .leftJoin(
          items,
          and(
            eq(items.id, productionJobBomItems.itemId),
            isNull(items.deletedAt),
          ),
        )
        .leftJoin(units, eq(units.id, items.unitId))
        .where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(OutsourceableOperationResDto, operations, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(total, reqDto),
    );
  }

  /** Lập phiếu ở `DRAFT`: chưa coi là hàng đã rời xưởng, phải gửi duyệt và xác nhận xuất mới sang
   * `SENT`.
   *
   * Rules:
   * - Không đụng `inventory_balances`: hàng gửi gia công là node COMPONENT của Job, không có tồn.
   * - Dòng do client gửi đủ cột, không resolve lại từ `productionJobOperationId`.
   */
  async createOutsourcingOrder(
    reqDto: CreateOutsourcingOrderReqDto,
    userId: string,
  ): Promise<void> {
    await this.ensureSupplierExists(reqDto.supplierId);
    this.validateOrderItems(reqDto.items);

    const { items: orderItems, ...orderFields } = reqDto;

    await this.db.transaction(async (tx) => {
      await this.assertWithinPlannedQuantity(tx, orderItems);

      const code = await this.generateOutsourcingOrderCode(tx);
      const [outsourcingOrder] = await tx
        .insert(outsourcingOrders)
        .values({ ...orderFields, code, createdBy: userId })
        .returning({ id: outsourcingOrders.id });

      await this.insertOrderItems(tx, outsourcingOrder.id, orderItems);
    });
  }

  /** Sửa phiếu `DRAFT`/`REJECTED`: thay toàn bộ header và dòng. Phiếu `REJECTED` giữ nguyên lý do
   * từ chối cho tới khi gửi duyệt lại. */
  async updateOutsourcingOrder(
    outsourcingOrderId: string,
    reqDto: CreateOutsourcingOrderReqDto,
  ): Promise<void> {
    await this.ensureSupplierExists(reqDto.supplierId);
    this.validateOrderItems(reqDto.items);

    const { items: orderItems, ...orderFields } = reqDto;

    await this.db.transaction(async (tx) => {
      const outsourcingOrder = await this.getOutsourcingOrderForUpdate(
        tx,
        outsourcingOrderId,
      );
      this.assertStatusIn(outsourcingOrder.status, EDITABLE_STATUSES);

      await this.assertWithinPlannedQuantity(
        tx,
        orderItems,
        outsourcingOrderId,
      );

      await tx
        .update(outsourcingOrders)
        .set({
          ...orderFields,
          expectedReturnDate: orderFields.expectedReturnDate ?? null,
          note: orderFields.note ?? null,
        })
        .where(eq(outsourcingOrders.id, outsourcingOrderId));

      await tx
        .delete(outsourcingOrderItems)
        .where(
          eq(outsourcingOrderItems.outsourcingOrderId, outsourcingOrderId),
        );
      await this.insertOrderItems(tx, outsourcingOrderId, orderItems);
    });
  }

  /** `DRAFT`/`REJECTED` → `PENDING_APPROVAL`. Kiểm tra lại định mức vì phiếu khác có thể đã gửi
   * thêm từ lúc lập nháp. */
  async submitOutsourcingOrder(
    outsourcingOrderId: string,
    userId: string,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const outsourcingOrder = await this.getOutsourcingOrderForUpdate(
        tx,
        outsourcingOrderId,
      );
      this.assertStatusIn(outsourcingOrder.status, EDITABLE_STATUSES);

      const orderItems = await tx
        .select({
          productionJobOperationId:
            outsourcingOrderItems.productionJobOperationId,
          quantity: outsourcingOrderItems.quantity,
        })
        .from(outsourcingOrderItems)
        .where(
          eq(outsourcingOrderItems.outsourcingOrderId, outsourcingOrderId),
        );
      await this.assertWithinPlannedQuantity(
        tx,
        orderItems,
        outsourcingOrderId,
      );

      await this.transitionStatus(
        tx,
        outsourcingOrderId,
        EDITABLE_STATUSES,
        OutsourcingOrderStatus.PENDING_APPROVAL,
        {
          submittedBy: userId,
          submittedAt: new Date(),
          rejectedBy: null,
          rejectedAt: null,
          rejectionReason: null,
        },
      );
    });
  }

  async approveOutsourcingOrder(
    outsourcingOrderId: string,
    userId: string,
  ): Promise<void> {
    await this.db.transaction((tx) =>
      this.transitionStatus(
        tx,
        outsourcingOrderId,
        [OutsourcingOrderStatus.PENDING_APPROVAL],
        OutsourcingOrderStatus.APPROVED,
        { approvedBy: userId, approvedAt: new Date() },
      ),
    );
  }

  async rejectOutsourcingOrder(
    outsourcingOrderId: string,
    reqDto: RejectOutsourcingOrderReqDto,
    userId: string,
  ): Promise<void> {
    await this.db.transaction((tx) =>
      this.transitionStatus(
        tx,
        outsourcingOrderId,
        [OutsourcingOrderStatus.PENDING_APPROVAL],
        OutsourcingOrderStatus.REJECTED,
        {
          rejectedBy: userId,
          rejectedAt: new Date(),
          rejectionReason: reqDto.reason,
        },
      ),
    );
  }

  /** `APPROVED` → `SENT`: thời điểm hàng thực sự rời xưởng, từ đây mới nhập hàng về được. */
  async confirmSendOutsourcingOrder(
    outsourcingOrderId: string,
    userId: string,
  ): Promise<void> {
    await this.db.transaction((tx) =>
      this.transitionStatus(
        tx,
        outsourcingOrderId,
        [OutsourcingOrderStatus.APPROVED],
        OutsourcingOrderStatus.SENT,
        { postedBy: userId, postedAt: new Date() },
      ),
    );
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

  private async insertOrderItems(
    tx: DbTransaction,
    outsourcingOrderId: string,
    orderItems: OutsourcingOrderItemReqDto[],
  ): Promise<void> {
    await tx.insert(outsourcingOrderItems).values(
      orderItems.map((orderItem, index) => ({
        ...orderItem,
        outsourcingOrderId,
        sortOrder: index,
      })),
    );
  }

  /**
   * Chặn tổng SL gửi của một công đoạn Job vượt định mức của node BOM.
   *
   * Rules:
   * - Khoá các công đoạn `FOR UPDATE` để hai phiếu cùng lập/gửi duyệt không cùng đọc "còn lại"
   *   rồi cùng vượt.
   * - Tính mọi phiếu chưa `CANCELLED`, kể cả nháp/chờ duyệt/bị từ chối: phiếu đó vẫn giữ chỗ.
   * - `excludedOutsourcingOrderId` là phiếu đang sửa, để không tự cộng SL cũ của chính nó.
   */
  private async assertWithinPlannedQuantity(
    tx: DbTransaction,
    orderItems: readonly {
      productionJobOperationId?: string | null;
      quantity: number;
    }[],
    excludedOutsourcingOrderId?: string,
  ): Promise<void> {
    const jobOperationItems = orderItems.flatMap((orderItem) =>
      orderItem.productionJobOperationId
        ? [
            {
              productionJobOperationId: orderItem.productionJobOperationId,
              quantity: orderItem.quantity,
            },
          ]
        : [],
    );
    if (jobOperationItems.length === 0) {
      return;
    }
    const jobOperationIds = jobOperationItems.map(
      (jobOperationItem) => jobOperationItem.productionJobOperationId,
    );

    const plannedJobOperations = await tx
      .select({
        productionJobOperationId: productionJobOperations.id,
        plannedQuantity: productionJobBomItems.plannedQuantity,
      })
      .from(productionJobOperations)
      .innerJoin(
        productionJobBomItems,
        eq(
          productionJobBomItems.id,
          productionJobOperations.productionJobBomItemId,
        ),
      )
      .where(inArray(productionJobOperations.id, jobOperationIds))
      .orderBy(asc(productionJobOperations.id))
      .for('update', { of: productionJobOperations });

    const sentByOtherOrders = await tx
      .select({
        productionJobOperationId:
          outsourcingOrderItems.productionJobOperationId,
        sentQuantity:
          sql<number>`coalesce(sum(${outsourcingOrderItems.quantity}), 0)`.mapWith(
            Number,
          ),
      })
      .from(outsourcingOrderItems)
      .innerJoin(
        outsourcingOrders,
        eq(outsourcingOrders.id, outsourcingOrderItems.outsourcingOrderId),
      )
      .where(
        and(
          inArray(
            outsourcingOrderItems.productionJobOperationId,
            jobOperationIds,
          ),
          ne(outsourcingOrders.status, OutsourcingOrderStatus.CANCELLED),
          excludedOutsourcingOrderId
            ? ne(outsourcingOrders.id, excludedOutsourcingOrderId)
            : undefined,
        ),
      )
      .groupBy(outsourcingOrderItems.productionJobOperationId);

    const sentQuantityByJobOperationId = new Map(
      sentByOtherOrders.map((sent) => [
        sent.productionJobOperationId,
        sent.sentQuantity,
      ]),
    );
    const plannedQuantityByJobOperationId = new Map(
      plannedJobOperations.map((planned) => [
        planned.productionJobOperationId,
        planned.plannedQuantity,
      ]),
    );

    const exceedsPlannedQuantity = jobOperationItems.some(
      (orderItem) =>
        (sentQuantityByJobOperationId.get(orderItem.productionJobOperationId) ??
          0) +
          orderItem.quantity >
        (plannedQuantityByJobOperationId.get(
          orderItem.productionJobOperationId,
        ) ?? 0),
    );
    if (exceedsPlannedQuantity) {
      throw new AppException(ErrorCode.E184, HttpStatus.CONFLICT);
    }
  }

  /** UPDATE chỉ khi phiếu còn đúng ở `fromStatuses`: kiểm tra và ghi cùng một câu lệnh nên hai
   * thao tác đồng thời (duyệt vs từ chối, gửi duyệt vs huỷ) không ghi đè nhau; bên thua nhận E098. */
  private async transitionStatus(
    tx: DbTransaction,
    outsourcingOrderId: string,
    fromStatuses: readonly OutsourcingOrderStatus[],
    toStatus: OutsourcingOrderStatus,
    stampFields: Partial<typeof outsourcingOrders.$inferInsert>,
  ): Promise<void> {
    const transitionedOrders = await tx
      .update(outsourcingOrders)
      .set({ ...stampFields, status: toStatus })
      .where(
        and(
          eq(outsourcingOrders.id, outsourcingOrderId),
          inArray(outsourcingOrders.status, [...fromStatuses]),
        ),
      )
      .returning({ id: outsourcingOrders.id });

    if (transitionedOrders.length > 0) {
      return;
    }

    await this.ensureOutsourcingOrderExists(outsourcingOrderId, tx);
    throw new AppException(ErrorCode.E098, HttpStatus.CONFLICT);
  }

  private assertStatusIn(
    status: OutsourcingOrderStatus,
    allowedStatuses: readonly OutsourcingOrderStatus[],
  ): void {
    if (!allowedStatuses.includes(status)) {
      throw new AppException(ErrorCode.E098, HttpStatus.CONFLICT);
    }
  }

  private validateOrderItems(reqItems: OutsourcingOrderItemReqDto[]): void {
    if (!reqItems.length) {
      throw new AppException(ErrorCode.E182, HttpStatus.BAD_REQUEST);
    }

    const operationIds = reqItems.map((item) => item.productionJobOperationId);
    if (new Set(operationIds).size !== operationIds.length) {
      throw new AppException(ErrorCode.E183, HttpStatus.BAD_REQUEST);
    }

    // Một phiếu chỉ gửi gia công một công đoạn. `operationId` có thể null (snapshot mất liên kết
    // danh mục) nên fallback về mã công đoạn.
    const operationKeys = new Set(
      reqItems.map((item) => item.operationId ?? item.operationCode),
    );
    if (operationKeys.size > 1) {
      throw new AppException(ErrorCode.E280, HttpStatus.BAD_REQUEST);
    }
  }

  /** Truyền `tx` khi đang trong transaction: dùng `this.db` ở đó phải chờ thêm một kết nối. */
  private async ensureOutsourcingOrderExists(
    outsourcingOrderId: string,
    executor: Database | DbTransaction = this.db,
  ): Promise<void> {
    const [existing] = await executor
      .select({ id: outsourcingOrders.id })
      .from(outsourcingOrders)
      .where(eq(outsourcingOrders.id, outsourcingOrderId))
      .limit(1);

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

  /** Khoá dòng phiếu `FOR UPDATE`, chỉ gọi trong transaction: chặn hai `cancel` đồng thời. */
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
