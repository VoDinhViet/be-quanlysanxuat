import { HttpStatus, Inject, Injectable, StreamableFile } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  gte,
  inArray,
  isNull,
  lte,
  or,
  sql,
} from 'drizzle-orm';
import { DateTime } from 'luxon';

import { OffsetPaginationDto } from '../../common/dto/offset-pagination/offset-pagination.dto';
import { OffsetPaginatedDto } from '../../common/dto/offset-pagination/paginated.dto';
import {
  DocumentType,
  generateDocumentSequence,
} from '../../common/utils/document-sequence.util';
import { buildXlsxBuffer, XLSX_MIME } from '../../common/utils/excel.util';
import { unaccentILike } from '../../common/utils/search.util';
import { ErrorCode } from '../../constants/error-code.constant';
import { DRIZZLE } from '../../database/database.module';
import type { Database, DbTransaction } from '../../database/database.type';
import {
  clients,
  files,
  InventoryDocumentStatus,
  InventoryIssueType,
  inventoryIssueItems,
  inventoryIssues,
  items,
  OrderItemStatus,
  orderItems,
  orders,
  OrderStatus,
  outboundOrderItems,
  outboundOrders,
  OutboundOrderInvoiceStatus,
  OutboundOrderStatus,
  productionJobs,
  productionOrders,
  ProductionOrderSourceType,
  units,
  users,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import {
  getInventoryBalancesForUpdate,
  onHandQuantityByItemSubquery,
} from '../inventory/item-stock.query';
import { getJobFinalOperation, getJobQcCoverage } from '../oqc/oqc.query';
import { issuedQuantityByOrderItemIdSubquery } from '../orders/orders.query';
import { CreateOutboundOrderReqDto } from './dto/create-outbound-order.req.dto';
import { ExportOutboundOrdersReqDto } from './dto/export-outbound-orders.req.dto';
import { GetOutboundOrderStatsReqDto } from './dto/get-outbound-order-stats.req.dto';
import { GetOutboundOrdersReqDto } from './dto/get-outbound-orders.req.dto';
import { GetUnfulfilledOrderItemsReqDto } from './dto/get-unfulfilled-order-items.req.dto';
import { OutboundOrderItemResDto } from './dto/outbound-order-item.res.dto';
import { OutboundOrderResDto } from './dto/outbound-order.res.dto';
import { OutboundOrderStatsResDto } from './dto/outbound-order-stats.res.dto';
import { PageOutboundOrderResDto } from './dto/page-outbound-order.res.dto';
import { OutboundOrderItemReqDto } from './dto/outbound-order-item.req.dto';
import { RejectOutboundOrderReqDto } from './dto/reject-outbound-order.req.dto';
import { UnfulfilledOrderItemResDto } from './dto/unfulfilled-order-item.res.dto';
import { UpdateOutboundOrderInvoiceReqDto } from './dto/update-outbound-order-invoice.req.dto';
import { UpdateOutboundOrderReqDto } from './dto/update-outbound-order.req.dto';
import { OUTBOUND_ORDER_EXPORT_COLUMNS } from './outbound-orders.export';
import {
  getOutboundHeldQuantities,
  outboundHeldQuantityByItemSubquery,
  orderPoNoMatch,
  outboundOrderLineMatchExists,
  outboundOrderSummarySubquery,
} from './outbound-orders.query';

@Injectable()
export class OutboundOrdersService {
  // Order còn "chưa hoàn thành" theo nghĩa DO: đã qua cổng duyệt, chưa xong/chưa huỷ. Cùng tập
  // trạng thái `openOrderDemandByItemSubquery` (`inventory.query.ts`) dùng cho nhu cầu đơn đang mở.
  private static readonly UNFULFILLED_ORDER_STATUSES = [
    OrderStatus.AWAITING_PRODUCTION,
    OrderStatus.IN_PROGRESS,
  ];

  private static readonly MAX_EXPORT_ROWS = 10_000;

  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async getOutboundOrders(
    reqDto: GetOutboundOrdersReqDto,
  ): Promise<OffsetPaginatedDto<PageOutboundOrderResDto>> {
    const where = and(
      reqDto.q
        ? unaccentILike(outboundOrders.code, `%${reqDto.q}%`)
        : undefined,
      reqDto.clientId
        ? eq(outboundOrders.clientId, reqDto.clientId)
        : undefined,
      reqDto.status ? eq(outboundOrders.status, reqDto.status) : undefined,
      reqDto.fulfillmentType
        ? eq(outboundOrders.fulfillmentType, reqDto.fulfillmentType)
        : undefined,
      reqDto.startDate
        ? gte(outboundOrders.fulfillmentDate, reqDto.startDate)
        : undefined,
      reqDto.endDate
        ? lte(outboundOrders.fulfillmentDate, reqDto.endDate)
        : undefined,
      reqDto.invoiceStatus
        ? eq(outboundOrders.invoiceStatus, reqDto.invoiceStatus)
        : undefined,
      outboundOrderLineMatchExists(this.db, reqDto),
    );

    const summary = outboundOrderSummarySubquery(this.db);

    const [entities, [{ total }]] = await Promise.all([
      this.db
        .select({
          ...getTableColumns(outboundOrders),
          client: getTableColumns(clients),
          creatorBy: getTableColumns(users),
          orderCodes: sql<string[]>`coalesce(${summary.orderCodes}, '{}')`,
          buyerPoNos: sql<string[]>`coalesce(${summary.buyerPoNos}, '{}')`,
          totalQuantity:
            sql<number>`coalesce(${summary.totalQuantity}, 0)`.mapWith(Number),
        })
        .from(outboundOrders)
        .innerJoin(clients, eq(clients.id, outboundOrders.clientId))
        .leftJoin(users, eq(users.id, outboundOrders.createdBy))
        .leftJoin(summary, eq(summary.outboundOrderId, outboundOrders.id))
        .where(where)
        .orderBy(desc(outboundOrders.createdAt))
        .limit(reqDto.limit)
        .offset(reqDto.offset),
      this.db.select({ total: count() }).from(outboundOrders).where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(PageOutboundOrderResDto, entities, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(total, reqDto),
    );
  }

  /** Không lọc theo trạng thái: `total` đếm mọi DO, `notInvoiced` chỉ đếm DO đã giao chưa xuất hóa
   * đơn, để bấm vào một thẻ không làm con số đổi. Bộ lọc tách riêng khỏi `getOutboundOrders` như
   * `exportOutboundOrders`: route độc lập, sửa filter route nào chỉ route đó đổi. */
  async getOutboundOrderStats(
    reqDto: GetOutboundOrderStatsReqDto,
  ): Promise<OutboundOrderStatsResDto> {
    const where = and(
      reqDto.q
        ? unaccentILike(outboundOrders.code, `%${reqDto.q}%`)
        : undefined,
      reqDto.clientId
        ? eq(outboundOrders.clientId, reqDto.clientId)
        : undefined,
      reqDto.fulfillmentType
        ? eq(outboundOrders.fulfillmentType, reqDto.fulfillmentType)
        : undefined,
      reqDto.startDate
        ? gte(outboundOrders.fulfillmentDate, reqDto.startDate)
        : undefined,
      reqDto.endDate
        ? lte(outboundOrders.fulfillmentDate, reqDto.endDate)
        : undefined,
      outboundOrderLineMatchExists(this.db, reqDto),
    );

    const [stats] = await this.db
      .select({
        total: count(),
        notInvoiced:
          sql<number>`count(*) filter (where ${outboundOrders.status} = ${OutboundOrderStatus.DELIVERED} and ${outboundOrders.invoiceStatus} = ${OutboundOrderInvoiceStatus.NOT_ISSUED})`.mapWith(
            Number,
          ),
      })
      .from(outboundOrders)
      .where(where);

    return plainToInstance(OutboundOrderStatsResDto, stats, {
      excludeExtraneousValues: true,
    });
  }

  /** Cắt im lặng ở `MAX_EXPORT_ROWS`, không báo lỗi khi vượt trần. Bộ lọc tách riêng khỏi
   * `getOutboundOrders` dù trông giống nhau: hai route độc lập, sửa filter route nào chỉ route đó
   * đổi. Riêng bộ lọc theo dòng (`outboundOrderLineMatchExists`) dùng chung có chủ đích. */
  async exportOutboundOrders(
    reqDto: ExportOutboundOrdersReqDto,
  ): Promise<StreamableFile> {
    const where = and(
      reqDto.q
        ? unaccentILike(outboundOrders.code, `%${reqDto.q}%`)
        : undefined,
      reqDto.clientId
        ? eq(outboundOrders.clientId, reqDto.clientId)
        : undefined,
      reqDto.status ? eq(outboundOrders.status, reqDto.status) : undefined,
      reqDto.fulfillmentType
        ? eq(outboundOrders.fulfillmentType, reqDto.fulfillmentType)
        : undefined,
      reqDto.startDate
        ? gte(outboundOrders.fulfillmentDate, reqDto.startDate)
        : undefined,
      reqDto.endDate
        ? lte(outboundOrders.fulfillmentDate, reqDto.endDate)
        : undefined,
      reqDto.invoiceStatus
        ? eq(outboundOrders.invoiceStatus, reqDto.invoiceStatus)
        : undefined,
      outboundOrderLineMatchExists(this.db, reqDto),
    );

    const summary = outboundOrderSummarySubquery(this.db);

    const outboundOrdersForExport = await this.db
      .select({
        code: outboundOrders.code,
        clientName: clients.name,
        clientCode: clients.code,
        fulfillmentDate: outboundOrders.fulfillmentDate,
        fulfillmentType: outboundOrders.fulfillmentType,
        status: outboundOrders.status,
        invoiceStatus: outboundOrders.invoiceStatus,
        invoiceNo: outboundOrders.invoiceNo,
        invoiceDate: outboundOrders.invoiceDate,
        orderCodes: sql<string[]>`coalesce(${summary.orderCodes}, '{}')`,
        buyerPoNos: sql<string[]>`coalesce(${summary.buyerPoNos}, '{}')`,
        totalQuantity:
          sql<number>`coalesce(${summary.totalQuantity}, 0)`.mapWith(Number),
        note: outboundOrders.note,
        creatorName: users.fullName,
        createdAt: outboundOrders.createdAt,
      })
      .from(outboundOrders)
      .innerJoin(clients, eq(clients.id, outboundOrders.clientId))
      .leftJoin(users, eq(users.id, outboundOrders.createdBy))
      .leftJoin(summary, eq(summary.outboundOrderId, outboundOrders.id))
      .where(where)
      .orderBy(desc(outboundOrders.createdAt))
      .limit(OutboundOrdersService.MAX_EXPORT_ROWS);

    const buffer = await buildXlsxBuffer(
      'Đơn giao hàng',
      OUTBOUND_ORDER_EXPORT_COLUMNS,
      outboundOrdersForExport,
    );
    const fileName = `don-giao-hang-${DateTime.now().toFormat('yyyyLLdd-HHmm')}.xlsx`;

    return new StreamableFile(buffer, {
      type: XLSX_MIME,
      disposition: `attachment; filename="${fileName}"`,
    });
  }

  async getOutboundOrder(
    outboundOrderId: string,
  ): Promise<OutboundOrderResDto> {
    const outboundOrder = await this.db.query.outboundOrders.findFirst({
      where: eq(outboundOrders.id, outboundOrderId),
      with: {
        client: true,
        creatorBy: true,
        senderBy: true,
        approverBy: true,
        rejecterBy: true,
        invoicerBy: true,
      },
    });

    if (!outboundOrder) {
      throw new AppException(ErrorCode.E195, HttpStatus.NOT_FOUND);
    }

    const [inventoryIssue] = await this.db
      .select({
        id: inventoryIssues.id,
        code: inventoryIssues.code,
        status: inventoryIssues.status,
      })
      .from(inventoryIssues)
      .where(eq(inventoryIssues.outboundOrderId, outboundOrderId))
      .limit(1);

    return plainToInstance(
      OutboundOrderResDto,
      { ...outboundOrder, inventoryIssue: inventoryIssue ?? null },
      { excludeExtraneousValues: true },
    );
  }

  /** `.select()` + join tường minh thay vì `db.query` lồng 2 cấp: DTO nhận `item`/`unit` cùng
   * cấp (không lồng `item.unit`) nên khớp thẳng shape select. Các cột SL tồn kho `LEFT JOIN` 3
   * subquery; "Đã giữ" truyền `excludeOutboundOrderId = outboundOrderId` để phiếu đang xem không
   * tự trừ mình, cùng lý do `ensureOutboundLinesIssuable` khi kiểm `E194`. */
  async getOutboundOrderItems(
    outboundOrderId: string,
  ): Promise<OutboundOrderItemResDto[]> {
    await this.ensureOutboundOrderExists(outboundOrderId);

    const issuedQty = issuedQuantityByOrderItemIdSubquery(this.db);
    const onHand = onHandQuantityByItemSubquery(this.db);
    const held = outboundHeldQuantityByItemSubquery(this.db, outboundOrderId);

    const rows = await this.db
      .select({
        ...getTableColumns(outboundOrderItems),
        item: getTableColumns(items),
        imageFile: getTableColumns(files),
        revision: items.revision,
        unit: getTableColumns(units),
        productionJob: getTableColumns(productionJobs),
        order: getTableColumns(orders),
        orderedQuantity: orderItems.quantity,
        issuedQuantity:
          sql<number>`coalesce(${issuedQty.issuedQty}, 0)`.mapWith(Number),
        onHandQuantity: sql<number>`coalesce(${onHand.onHand}, 0)`.mapWith(
          Number,
        ),
        heldQuantity: sql<number>`coalesce(${held.heldQuantity}, 0)`.mapWith(
          Number,
        ),
        availableQuantity:
          sql<number>`coalesce(${onHand.onHand}, 0) - coalesce(${held.heldQuantity}, 0)`.mapWith(
            Number,
          ),
      })
      .from(outboundOrderItems)
      .innerJoin(items, eq(items.id, outboundOrderItems.itemId))
      .innerJoin(units, eq(units.id, items.unitId))
      .leftJoin(files, eq(files.id, items.imageFileId))
      .leftJoin(
        productionJobs,
        eq(productionJobs.id, outboundOrderItems.productionJobId),
      )
      .innerJoin(orderItems, eq(orderItems.id, outboundOrderItems.orderItemId))
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .leftJoin(
        issuedQty,
        eq(issuedQty.orderItemId, outboundOrderItems.orderItemId),
      )
      .leftJoin(onHand, eq(onHand.itemId, outboundOrderItems.itemId))
      .leftJoin(held, eq(held.itemId, outboundOrderItems.itemId))
      .where(eq(outboundOrderItems.outboundOrderId, outboundOrderId))
      .orderBy(asc(outboundOrderItems.sortOrder));

    return plainToInstance(OutboundOrderItemResDto, rows, {
      excludeExtraneousValues: true,
    });
  }

  /** Popup "Chọn PO/Job cần giao" — dòng `order_items` còn `NORMAL` và chưa xuất đủ của đơn
   * `AWAITING_PRODUCTION`/`IN_PROGRESS`; lọc thêm `clientId` khi mở lại từ trang Sửa một DO đã có
   * khách hàng. Các cột tồn kho cùng khuôn `getOutboundOrderItems`; `excludeOutboundOrderId` loại
   * chính phiếu đang sửa khỏi "Đã giữ". */
  async getUnfulfilledOrderItems(
    reqDto: GetUnfulfilledOrderItemsReqDto,
  ): Promise<OffsetPaginatedDto<UnfulfilledOrderItemResDto>> {
    const issuedQty = issuedQuantityByOrderItemIdSubquery(this.db);
    const onHand = onHandQuantityByItemSubquery(this.db);
    const held = outboundHeldQuantityByItemSubquery(
      this.db,
      reqDto.excludeOutboundOrderId,
    );

    const issuedQtySql = () =>
      sql<number>`coalesce(${issuedQty.issuedQty}, 0)`.mapWith(Number);

    const availableQtySql = sql<number>`coalesce(${onHand.onHand}, 0) - coalesce(${held.heldQuantity}, 0)`;
    const itemKeyword = reqDto.itemKeyword
      ? `%${reqDto.itemKeyword}%`
      : undefined;

    const where = and(
      isNull(orders.deletedAt),
      inArray(orders.status, OutboundOrdersService.UNFULFILLED_ORDER_STATUSES),
      eq(orderItems.status, OrderItemStatus.NORMAL),
      reqDto.clientId ? eq(orders.clientId, reqDto.clientId) : undefined,
      reqDto.poNo ? orderPoNoMatch(reqDto.poNo) : undefined,
      reqDto.jobCode
        ? unaccentILike(productionJobs.code, `%${reqDto.jobCode}%`)
        : undefined,
      itemKeyword
        ? or(
            unaccentILike(items.code, itemKeyword),
            unaccentILike(items.name, itemKeyword),
            unaccentILike(items.revision, itemKeyword),
          )
        : undefined,
      reqDto.deliverableOnly ? sql`${availableQtySql} > 0` : undefined,
      sql`${issuedQtySql()} < ${orderItems.quantity}`,
    );

    // Danh sách và đếm dùng chung `where` (tham chiếu `orders`/`items`/`productionJobs` và các
    // subquery đã xuất/tồn/giữ) — query đếm phải join đủ các bảng đó, thiếu thì `total` lệch hoặc
    // lỗi cột.
    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select({
          orderItemId: orderItems.id,
          client: getTableColumns(clients),
          order: getTableColumns(orders),
          job: getTableColumns(productionJobs),
          item: getTableColumns(items),
          imageFile: getTableColumns(files),
          revision: items.revision,
          unit: getTableColumns(units),
          orderedQuantity: orderItems.quantity,
          issuedQuantity: issuedQtySql(),
          onHandQuantity: sql<number>`coalesce(${onHand.onHand}, 0)`.mapWith(
            Number,
          ),
          heldQuantity: sql<number>`coalesce(${held.heldQuantity}, 0)`.mapWith(
            Number,
          ),
          availableQuantity: availableQtySql.mapWith(Number),
        })
        .from(orderItems)
        .innerJoin(orders, eq(orders.id, orderItems.orderId))
        .innerJoin(clients, eq(clients.id, orders.clientId))
        .innerJoin(items, eq(items.id, orderItems.itemId))
        .innerJoin(units, eq(units.id, items.unitId))
        .leftJoin(files, eq(files.id, items.imageFileId))
        .leftJoin(
          productionOrders,
          and(
            eq(productionOrders.orderId, orders.id),
            eq(productionOrders.sourceType, ProductionOrderSourceType.ORDER),
          ),
        )
        .leftJoin(
          productionJobs,
          and(
            eq(productionJobs.productionOrderId, productionOrders.id),
            eq(productionJobs.itemId, orderItems.itemId),
          ),
        )
        .leftJoin(issuedQty, eq(issuedQty.orderItemId, orderItems.id))
        .leftJoin(onHand, eq(onHand.itemId, orderItems.itemId))
        .leftJoin(held, eq(held.itemId, orderItems.itemId))
        .where(where)
        .orderBy(desc(orders.createdAt))
        .limit(reqDto.limit)
        .offset(reqDto.offset),
      this.db
        .select({ total: count() })
        .from(orderItems)
        .innerJoin(orders, eq(orders.id, orderItems.orderId))
        .innerJoin(items, eq(items.id, orderItems.itemId))
        .leftJoin(
          productionOrders,
          and(
            eq(productionOrders.orderId, orders.id),
            eq(productionOrders.sourceType, ProductionOrderSourceType.ORDER),
          ),
        )
        .leftJoin(
          productionJobs,
          and(
            eq(productionJobs.productionOrderId, productionOrders.id),
            eq(productionJobs.itemId, orderItems.itemId),
          ),
        )
        .leftJoin(issuedQty, eq(issuedQty.orderItemId, orderItems.id))
        .leftJoin(onHand, eq(onHand.itemId, orderItems.itemId))
        .leftJoin(held, eq(held.itemId, orderItems.itemId))
        .where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(UnfulfilledOrderItemResDto, rows, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(total, reqDto),
    );
  }

  /** Tạo phiếu DO — luôn `DRAFT`, chưa đụng tồn kho thật. Giữ chỗ thành phẩm bắt đầu ngay ở đây
   * (`docs/CODEMAPS/sales.md`): `ensureOutboundLinesIssuable` chặn `E194` nếu vượt tồn khả dụng.
   * Dòng do client gửi đủ cột (`itemId`/`productionJobId` lấy từ popup `unfulfilled-order-items`),
   * server không resolve/validate lại phần còn lại. */
  async createOutboundOrder(
    reqDto: CreateOutboundOrderReqDto,
    userId: string,
  ): Promise<void> {
    await this.ensureClientExists(reqDto.clientId);

    const { items: reqItems, ...outboundOrderFields } = reqDto;

    await this.db.transaction(async (tx) => {
      const code = await this.generateOutboundOrderCode(tx);

      const [outboundOrder] = await tx
        .insert(outboundOrders)
        .values({ ...outboundOrderFields, code, createdBy: userId })
        .returning({ id: outboundOrders.id });

      await this.createOutboundOrderItems(tx, outboundOrder.id, reqItems);

      await this.ensureOutboundLinesIssuable(tx, outboundOrder.id);
    });
  }

  /** Sửa — chỉ khi `DRAFT` (`E259`), replace-all dòng (delete + reinsert, cùng khuôn
   * `InventoryRequisitionsService.replaceRequisitionItems`), rồi kiểm lại `E194` vì SL dòng có thể
   * đổi. `clientId` bất biến nên không cần `ensureClientExists` lại. */
  async updateOutboundOrder(
    outboundOrderId: string,
    reqDto: UpdateOutboundOrderReqDto,
  ): Promise<void> {
    const { items: itemsToReplace, ...outboundOrderFields } = reqDto;

    await this.db.transaction(async (tx) => {
      const outboundOrder = await this.getOutboundOrderForUpdate(
        tx,
        outboundOrderId,
      );

      if (outboundOrder.status !== OutboundOrderStatus.DRAFT) {
        throw new AppException(ErrorCode.E259, HttpStatus.CONFLICT);
      }

      await tx
        .update(outboundOrders)
        .set(outboundOrderFields)
        .where(eq(outboundOrders.id, outboundOrderId));

      await this.replaceOutboundOrderItems(tx, outboundOrderId, itemsToReplace);

      await this.ensureOutboundLinesIssuable(tx, outboundOrderId);
    });
  }

  /** `DRAFT`/`PENDING_APPROVAL`/`PENDING_DELIVERY` → `CANCELLED` (`E257` với trạng thái khác, kể cả
   * `REJECTED`/`DELIVERED`). Ba trạng thái trên chưa xuất kho nên chưa có `inventory_transactions`
   * nào để đảo; phiếu xuất nháp sinh lúc duyệt huỷ theo. Giữ chỗ FG tự hết vì `HOLDING_STATUSES`
   * (`outbound-orders.query.ts`) không còn khớp `CANCELLED`. */
  async cancelOutboundOrder(outboundOrderId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const outboundOrder = await this.getOutboundOrderForUpdate(
        tx,
        outboundOrderId,
      );

      const cancellableStatuses: OutboundOrderStatus[] = [
        OutboundOrderStatus.DRAFT,
        OutboundOrderStatus.PENDING_APPROVAL,
        OutboundOrderStatus.PENDING_DELIVERY,
      ];
      if (!cancellableStatuses.includes(outboundOrder.status)) {
        throw new AppException(ErrorCode.E257, HttpStatus.CONFLICT);
      }

      await tx
        .update(outboundOrders)
        .set({ status: OutboundOrderStatus.CANCELLED })
        .where(eq(outboundOrders.id, outboundOrderId));

      await tx
        .update(inventoryIssues)
        .set({ status: InventoryDocumentStatus.CANCELLED })
        .where(
          and(
            eq(inventoryIssues.outboundOrderId, outboundOrderId),
            eq(inventoryIssues.status, InventoryDocumentStatus.DRAFT),
          ),
        );
    });
  }

  /** Xoá — chỉ khi `DRAFT` (`E258`), hard delete, cùng khuôn
   * `InventoryRequisitionsService.deleteInventoryRequisition`: một write nên không transaction,
   * không khoá `FOR UPDATE`. `outbound_order_items` xoá theo qua cascade. */
  async deleteOutboundOrder(outboundOrderId: string): Promise<void> {
    await this.ensureOutboundOrderDraft(outboundOrderId);

    await this.db
      .delete(outboundOrders)
      .where(eq(outboundOrders.id, outboundOrderId));
  }

  private async ensureOutboundOrderDraft(
    outboundOrderId: string,
  ): Promise<void> {
    const outboundOrder = await this.db.query.outboundOrders.findFirst({
      columns: { status: true },
      where: eq(outboundOrders.id, outboundOrderId),
    });

    if (!outboundOrder) {
      throw new AppException(ErrorCode.E195, HttpStatus.NOT_FOUND);
    }

    if (outboundOrder.status !== OutboundOrderStatus.DRAFT) {
      throw new AppException(ErrorCode.E258, HttpStatus.CONFLICT);
    }
  }

  private async createOutboundOrderItems(
    tx: DbTransaction,
    outboundOrderId: string,
    items: OutboundOrderItemReqDto[],
  ): Promise<void> {
    await tx.insert(outboundOrderItems).values(
      items.map((item, index) => ({
        ...item,
        outboundOrderId,
        sortOrder: index,
      })),
    );
  }

  private async replaceOutboundOrderItems(
    tx: DbTransaction,
    outboundOrderId: string,
    items: OutboundOrderItemReqDto[],
  ): Promise<void> {
    await tx
      .delete(outboundOrderItems)
      .where(eq(outboundOrderItems.outboundOrderId, outboundOrderId));

    await this.createOutboundOrderItems(tx, outboundOrderId, items);
  }

  /** `DRAFT`/`REJECTED` → `PENDING_APPROVAL` — chạy gate QC, rồi kiểm lại `E194`
   * (`ensureOutboundLinesIssuable`) vì tồn có thể đổi từ lúc tạo; `approveOutboundOrder` kiểm lại
   * lần nữa cùng lý do. */
  async sendOutboundOrder(
    outboundOrderId: string,
    userId: string,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const outboundOrder = await this.getOutboundOrderForUpdate(
        tx,
        outboundOrderId,
      );

      if (
        outboundOrder.status !== OutboundOrderStatus.DRAFT &&
        outboundOrder.status !== OutboundOrderStatus.REJECTED
      ) {
        throw new AppException(ErrorCode.E239, HttpStatus.CONFLICT);
      }

      await this.ensureAllJobsQcCompleted(tx, outboundOrderId);
      await this.ensureOutboundLinesIssuable(tx, outboundOrderId);

      await tx
        .update(outboundOrders)
        .set({
          status: OutboundOrderStatus.PENDING_APPROVAL,
          sentBy: userId,
          sentAt: new Date(),
        })
        .where(eq(outboundOrders.id, outboundOrderId));
    });
  }

  /** `PENDING_APPROVAL → PENDING_DELIVERY` ("Chờ xuất kho") và sinh phiếu xuất `SALES` nháp — chưa
   * trừ tồn, thủ kho ghi sổ phiếu đó thì DO mới `DELIVERED`. Gate QC chỉ chạy 1 lần ở `send`.
   * Kiểm lại `E194` vì một `POST /inventory-issues` thủ công có thể rút tồn FG giữa hai bước mà
   * không đụng DO nào. */
  async approveOutboundOrder(
    outboundOrderId: string,
    userId: string,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const outboundOrder = await this.getOutboundOrderForUpdate(
        tx,
        outboundOrderId,
      );

      if (outboundOrder.status !== OutboundOrderStatus.PENDING_APPROVAL) {
        throw new AppException(ErrorCode.E240, HttpStatus.CONFLICT);
      }

      await this.ensureOutboundLinesIssuable(tx, outboundOrderId);

      await tx
        .update(outboundOrders)
        .set({
          status: OutboundOrderStatus.PENDING_DELIVERY,
          approvedBy: userId,
          approvedAt: new Date(),
        })
        .where(eq(outboundOrders.id, outboundOrderId));

      await this.createSalesIssueDraft(tx, outboundOrderId, userId);
    });
  }

  /** Chốt chặn "Σ SL cùng vật tư ≤ Có thể giao" (`E194`, Có thể giao = Tồn kho FG − Đã giữ của DO
   * khác đang giữ chỗ) — gọi từ cả `send` (chốt thật) lẫn `approve` (kiểm lại), cùng khuôn
   * `InventoryRequisitionsService.validateRequisitionLines`. Khoá `inventory_balances` trước khi
   * đọc, không thì hai DO gửi duyệt đồng thời cùng đọc một số "Đã giữ" và cùng lọt. Cộng dồn theo
   * `itemId` trước khi so vì một DO được phép có nhiều dòng cùng vật tư. */
  private async ensureOutboundLinesIssuable(
    tx: DbTransaction,
    outboundOrderId: string,
  ): Promise<void> {
    const itemsToValidate = await tx
      .select({
        itemId: outboundOrderItems.itemId,
        quantity: outboundOrderItems.quantity,
      })
      .from(outboundOrderItems)
      .where(eq(outboundOrderItems.outboundOrderId, outboundOrderId));

    const lineQuantityByItemId = new Map<string, number>();
    for (const item of itemsToValidate) {
      lineQuantityByItemId.set(
        item.itemId,
        (lineQuantityByItemId.get(item.itemId) ?? 0) + item.quantity,
      );
    }

    const itemIds = [...lineQuantityByItemId.keys()];

    // `getInventoryBalancesForUpdate` đã khoá VÀ trả về đúng các dòng cần — dùng thẳng làm
    // `onHandRows`, không đọc lại lần hai.
    const [onHandRows, heldByOtherOrdersByItemId] = await Promise.all([
      getInventoryBalancesForUpdate(tx, itemIds),
      getOutboundHeldQuantities(tx, {
        itemIds,
        excludeOutboundOrderId: outboundOrderId,
      }),
    ]);

    const onHandByItemId = new Map(
      onHandRows.map((row) => [row.itemId, row.quantity]),
    );

    for (const [itemId, lineQuantity] of lineQuantityByItemId) {
      const onHand = onHandByItemId.get(itemId) ?? 0;
      const heldByOtherOrders = heldByOtherOrdersByItemId.get(itemId) ?? 0;
      const issuableQuantity = onHand - heldByOtherOrders;

      if (lineQuantity > issuableQuantity) {
        throw new AppException(ErrorCode.E194, HttpStatus.CONFLICT);
      }
    }
  }

  /** `PENDING_APPROVAL → REJECTED` — `send` lại được từ đây, nhưng không sửa dòng được
   * (`updateOutboundOrder` chỉ nhận `DRAFT`) và không huỷ được (`E257`). */
  async rejectOutboundOrder(
    outboundOrderId: string,
    reqDto: RejectOutboundOrderReqDto,
    userId: string,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const outboundOrder = await this.getOutboundOrderForUpdate(
        tx,
        outboundOrderId,
      );

      if (outboundOrder.status !== OutboundOrderStatus.PENDING_APPROVAL) {
        throw new AppException(ErrorCode.E240, HttpStatus.CONFLICT);
      }

      await tx
        .update(outboundOrders)
        .set({
          status: OutboundOrderStatus.REJECTED,
          rejectedBy: userId,
          rejectedAt: new Date(),
          rejectionReason: reqDto.reason,
        })
        .where(eq(outboundOrders.id, outboundOrderId));
    });
  }

  /** Chặn (`E205`) nếu một Job trong các dòng (bỏ qua dòng `productionJobId = null`) chưa có lô QC
   * nào qua (`getJobQcCoverage`) hoặc còn IQC chưa `COMPLETED`. Chỉ gọi ở `sendOutboundOrder`.
   *
   * Rules:
   * - Job có OQC thành phẩm: chỉ cần >= 1 lô `COMPLETED`; lô khác đang dở không chặn giao phần đã
   *   đạt. SL giao vẫn bị chặn bởi tồn thực (`E194`) vì thành phẩm chỉ vào kho sau khi lô qua OQC
   *   và được nhập.
   * - Job không có OQC: chặn khi còn bất kỳ dòng QC nào chưa `COMPLETED`. */
  private async ensureAllJobsQcCompleted(
    tx: DbTransaction,
    outboundOrderId: string,
  ): Promise<void> {
    const jobRows = await tx
      .selectDistinct({ productionJobId: outboundOrderItems.productionJobId })
      .from(outboundOrderItems)
      .where(eq(outboundOrderItems.outboundOrderId, outboundOrderId));

    const jobIds = jobRows
      .map((row) => row.productionJobId)
      .filter((jobId): jobId is string => jobId !== null);

    for (const jobId of jobIds) {
      const [coverage, finalOperation] = await Promise.all([
        getJobQcCoverage(tx, jobId),
        getJobFinalOperation(tx, jobId),
      ]);
      const hasPassedLot = finalOperation?.operationId
        ? coverage.finalCompleted > 0
        : coverage.open === 0;
      if (coverage.total === 0 || coverage.openIqc > 0 || !hasPassedLot) {
        throw new AppException(ErrorCode.E205, HttpStatus.CONFLICT);
      }
    }
  }

  /** Chỉ DO đã giao (`DELIVERED`, `E320`); nhập lại để sửa số hóa đơn được. Lưu là tự thành
   * `ISSUED`. Khoá dòng DO để hai lần lưu đồng thời không ghi chồng nhau. */
  async updateOutboundOrderInvoice(
    outboundOrderId: string,
    reqDto: UpdateOutboundOrderInvoiceReqDto,
    userId: string,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const lockedOutboundOrder = await this.getOutboundOrderForUpdate(
        tx,
        outboundOrderId,
      );

      if (lockedOutboundOrder.status !== OutboundOrderStatus.DELIVERED) {
        throw new AppException(ErrorCode.E320, HttpStatus.CONFLICT);
      }

      await tx
        .update(outboundOrders)
        .set({
          invoiceStatus: OutboundOrderInvoiceStatus.ISSUED,
          invoiceNo: reqDto.invoiceNo,
          invoiceDate: reqDto.invoiceDate,
          invoicedBy: userId,
          invoicedAt: new Date(),
        })
        .where(eq(outboundOrders.id, outboundOrderId));
    });
  }

  /** Phiếu xuất `SALES` nháp của DO vừa duyệt: thủ kho vào đó xác nhận xuất, lúc ghi sổ DO mới
   * thành `DELIVERED` (`InventoryIssuesService.postInventoryIssue`). */
  private async createSalesIssueDraft(
    tx: DbTransaction,
    outboundOrderId: string,
    userId: string,
  ): Promise<void> {
    const itemsToIssue = await tx
      .select({
        itemId: outboundOrderItems.itemId,
        quantity: outboundOrderItems.quantity,
        orderItemId: outboundOrderItems.orderItemId,
        unitId: items.unitId,
      })
      .from(outboundOrderItems)
      .innerJoin(items, eq(items.id, outboundOrderItems.itemId))
      .where(eq(outboundOrderItems.outboundOrderId, outboundOrderId));

    const issueDate = new Date();
    const issueCode = await this.generateSalesIssueCode(tx, issueDate);

    const [salesIssue] = await tx
      .insert(inventoryIssues)
      .values({
        code: issueCode,
        issueType: InventoryIssueType.SALES,
        issueDate,
        outboundOrderId,
        createdBy: userId,
      })
      .returning({ id: inventoryIssues.id });

    await tx.insert(inventoryIssueItems).values(
      itemsToIssue.map((item) => ({
        issueId: salesIssue.id,
        itemId: item.itemId,
        unitId: item.unitId,
        quantity: item.quantity,
        orderItemId: item.orderItemId,
      })),
    );
  }

  /** Copy có chủ ý từ `InventoryIssuesService.generateIssueCode` (`private`, khác module), như
   * `orders.query.ts` làm cho subquery xuyên domain. */
  private async generateSalesIssueCode(
    tx: DbTransaction,
    issueDate: Date,
  ): Promise<string> {
    const year = issueDate.getFullYear();
    const sequence = await generateDocumentSequence(
      tx,
      DocumentType.INVENTORY_ISSUE,
      year,
    );

    return `PXK-${year}-${String(sequence).padStart(5, '0')}`;
  }

  /** Khoá dòng phiếu (`FOR UPDATE`) rồi trả về — chỉ gọi trong transaction, cùng khuôn
   * `InventoryIssuesService.getInventoryIssueForUpdate`. */
  private async getOutboundOrderForUpdate(
    tx: DbTransaction,
    outboundOrderId: string,
  ) {
    const [outboundOrder] = await tx
      .select()
      .from(outboundOrders)
      .where(eq(outboundOrders.id, outboundOrderId))
      .for('update');

    if (!outboundOrder) {
      throw new AppException(ErrorCode.E195, HttpStatus.NOT_FOUND);
    }

    return outboundOrder;
  }

  private async ensureOutboundOrderExists(
    outboundOrderId: string,
  ): Promise<void> {
    const existing = await this.db.query.outboundOrders.findFirst({
      columns: { id: true },
      where: eq(outboundOrders.id, outboundOrderId),
    });

    if (!existing) {
      throw new AppException(ErrorCode.E195, HttpStatus.NOT_FOUND);
    }
  }

  private async ensureClientExists(clientId: string): Promise<void> {
    const existing = await this.db.query.clients.findFirst({
      columns: { id: true },
      where: and(eq(clients.id, clientId), isNull(clients.deletedAt)),
    });

    if (!existing) {
      throw new AppException(ErrorCode.E009, HttpStatus.NOT_FOUND);
    }
  }

  /** `DO-{yyMMdd}-{seq trong ngày}` — ngày là lúc tạo phiếu, không phải `fulfillmentDate` (có thể
   * ở tương lai), vì DO không có trường ngày nghiệp vụ như `receiptDate` của phiếu nhập.
   * `document_sequences.year` bị mượn làm khoá reset-theo-ngày: lưu nguyên `yyMMdd` (không phải
   * năm thật) để mỗi ngày có một dãy số riêng. */
  private async generateOutboundOrderCode(tx: DbTransaction): Promise<string> {
    const now = new Date();
    const yy = String(now.getFullYear() % 100).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const dayKey = Number(`${yy}${mm}${dd}`);

    const sequence = await generateDocumentSequence(
      tx,
      DocumentType.OUTBOUND_ORDER,
      dayKey,
    );

    return `DO-${yy}${mm}${dd}-${String(sequence).padStart(3, '0')}`;
  }
}
