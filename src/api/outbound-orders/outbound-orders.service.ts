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
  clients,
  InventoryDocumentStatus,
  InventoryIssueType,
  inventoryIssueItems,
  inventoryIssues,
  InventoryReferenceType,
  InventoryTransactionType,
  items,
  OrderItemStatus,
  orderItems,
  orders,
  OrderStatus,
  outboundOrderItems,
  outboundOrders,
  OutboundOrderStatus,
  productionJobs,
  productionOrders,
  units,
  warehouses,
  WarehouseType,
} from '../../database/schemas';
import { AppException } from '../../exceptions/app.exception';
import type { InventoryPostingLine } from '../inventory/inventory-posting.service';
import { InventoryPostingService } from '../inventory/inventory-posting.service';
import { getJobQcCoverage } from '../oqc/oqc.query';
import { issuedQuantityByOrderItemIdSubquery } from '../orders/orders.query';
import { CreateOutboundOrderReqDto } from './dto/create-outbound-order.req.dto';
import { GetOutboundOrdersReqDto } from './dto/get-outbound-orders.req.dto';
import { GetUnfulfilledOrderItemsReqDto } from './dto/get-unfulfilled-order-items.req.dto';
import { OutboundOrderItemResDto } from './dto/outbound-order-item.res.dto';
import { OutboundOrderResDto } from './dto/outbound-order.res.dto';
import { PageOutboundOrderResDto } from './dto/page-outbound-order.res.dto';
import { UnfulfilledOrderItemResDto } from './dto/unfulfilled-order-item.res.dto';

@Injectable()
export class OutboundOrdersService {
  // Order còn "chưa hoàn thành" theo nghĩa DO — đã qua duyệt Giám đốc, chưa xong/chưa huỷ. Cùng tập
  // trạng thái `InventoryService.reservedSubquery` dùng cho "đơn đã hứa với khách".
  private static readonly UNFULFILLED_ORDER_STATUSES = [
    OrderStatus.AWAITING_PRODUCTION,
    OrderStatus.IN_PROGRESS,
  ];

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly inventoryPostingService: InventoryPostingService,
  ) {}

  async getOutboundOrders(
    reqDto: GetOutboundOrdersReqDto,
  ): Promise<OffsetPaginatedDto<PageOutboundOrderResDto>> {
    const where = reqDto.q
      ? unaccentILike(outboundOrders.code, `%${reqDto.q}%`)
      : undefined;

    const [entities, countRows] = await Promise.all([
      this.db.query.outboundOrders.findMany({
        where,
        limit: reqDto.limit,
        offset: reqDto.offset,
        orderBy: desc(outboundOrders.createdAt),
        with: { client: true, creatorBy: true },
      }),
      this.db.select({ total: count() }).from(outboundOrders).where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(PageOutboundOrderResDto, entities, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(countRows[0]?.total ?? 0, reqDto),
    );
  }

  async getOutboundOrder(
    outboundOrderId: string,
  ): Promise<OutboundOrderResDto> {
    const outboundOrder = await this.db.query.outboundOrders.findFirst({
      where: eq(outboundOrders.id, outboundOrderId),
      with: { client: true, creatorBy: true },
    });

    if (!outboundOrder) {
      throw new AppException(ErrorCode.E195, HttpStatus.NOT_FOUND);
    }

    return plainToInstance(OutboundOrderResDto, outboundOrder, {
      excludeExtraneousValues: true,
    });
  }

  /** `.select()` + join tường minh thay vì `db.query` quan hệ lồng 2 cấp: DTO nhận `item`/`unit`
   * cùng cấp (không lồng `item.unit`), khớp thẳng shape select nên không cần map lại. */
  async getOutboundOrderItems(
    outboundOrderId: string,
  ): Promise<OutboundOrderItemResDto[]> {
    await this.ensureOutboundOrderExists(outboundOrderId);

    const rows = await this.db
      .select({
        ...getTableColumns(outboundOrderItems),
        item: getTableColumns(items),
        unit: getTableColumns(units),
        productionJob: getTableColumns(productionJobs),
        order: getTableColumns(orders),
      })
      .from(outboundOrderItems)
      .innerJoin(items, eq(items.id, outboundOrderItems.itemId))
      .innerJoin(units, eq(units.id, items.unitId))
      .leftJoin(
        productionJobs,
        eq(productionJobs.id, outboundOrderItems.productionJobId),
      )
      .innerJoin(orderItems, eq(orderItems.id, outboundOrderItems.orderItemId))
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(eq(outboundOrderItems.outboundOrderId, outboundOrderId))
      .orderBy(asc(outboundOrderItems.sortOrder));

    return plainToInstance(OutboundOrderItemResDto, rows, {
      excludeExtraneousValues: true,
    });
  }

  /** Popup "Chọn PO/Job cần giao" — listing thuần theo trạng thái: mọi dòng `order_items` chưa
   * `CANCELLED` của đơn `AWAITING_PRODUCTION`/`IN_PROGRESS`. Không lọc theo SL đã giao, không tính
   * tồn/giữ chỗ — chờ thiết kế lại (`docs/domains/inventory.md`, mục "Giao hàng"). */
  async getUnfulfilledOrderItems(
    reqDto: GetUnfulfilledOrderItemsReqDto,
  ): Promise<OffsetPaginatedDto<UnfulfilledOrderItemResDto>> {
    const where = and(
      isNull(orders.deletedAt),
      inArray(orders.status, OutboundOrdersService.UNFULFILLED_ORDER_STATUSES),
      eq(orderItems.status, OrderItemStatus.NORMAL),
    );

    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select({
          orderItemId: orderItems.id,
          client: getTableColumns(clients),
          order: getTableColumns(orders),
          job: getTableColumns(productionJobs),
          item: getTableColumns(items),
          unit: getTableColumns(units),
          orderedQuantity: orderItems.quantity,
        })
        .from(orderItems)
        .innerJoin(orders, eq(orders.id, orderItems.orderId))
        .innerJoin(clients, eq(clients.id, orders.clientId))
        .innerJoin(items, eq(items.id, orderItems.itemId))
        .innerJoin(units, eq(units.id, items.unitId))
        .leftJoin(productionOrders, eq(productionOrders.orderId, orders.id))
        .leftJoin(
          productionJobs,
          and(
            eq(productionJobs.productionOrderId, productionOrders.id),
            eq(productionJobs.itemId, orderItems.itemId),
          ),
        )
        .where(where)
        .orderBy(desc(orders.createdAt))
        .limit(reqDto.limit)
        .offset(reqDto.offset),
      this.db
        .select({ total: count() })
        .from(orderItems)
        .innerJoin(orders, eq(orders.id, orderItems.orderId))
        .where(where),
    ]);

    return new OffsetPaginatedDto(
      plainToInstance(UnfulfilledOrderItemResDto, rows, {
        excludeExtraneousValues: true,
      }),
      new OffsetPaginationDto(total, reqDto),
    );
  }

  /** Tạo phiếu DO — phase 1 luôn `DRAFT`, chưa duyệt/xác nhận giao, chưa đụng tồn kho
   * (`docs/domains/inventory.md`, mục "Giao hàng"). Dòng do client gửi đủ cột (`itemId`/
   * `productionJobId` lấy từ popup `unfulfilled-order-items`), server không resolve/validate lại. */
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

      await tx.insert(outboundOrderItems).values(
        reqItems.map((item, index) => ({
          ...item,
          outboundOrderId: outboundOrder.id,
          sortOrder: index,
        })),
      );
    });
  }

  /** `DRAFT → PENDING_DELIVERY` — chưa phải "giao thật" (chưa `DELIVERED`, chưa trừ tồn, chưa sinh
   * `inventory_issues`), đó là phase giao hàng 2 (`docs/domains/inventory.md`, mục "Giao hàng",
   * Common mistake #22). Chặn theo Job (`E205`): mỗi `productionJobId` distinct trong các dòng
   * (bỏ qua dòng `null` — DO không trỏ Job nào không có gì để chặn), Job nào chưa có dòng QC nào
   * hoặc còn dòng chưa `COMPLETED` (`getJobQcCoverage`, tái dùng gate `E196`) thì chặn cả phiếu. */
  async confirmOutboundOrder(outboundOrderId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const outboundOrder = await this.getOutboundOrderForUpdate(
        tx,
        outboundOrderId,
      );

      if (outboundOrder.status !== OutboundOrderStatus.DRAFT) {
        throw new AppException(ErrorCode.E204, HttpStatus.CONFLICT);
      }

      const itemsToConfirm = await tx.query.outboundOrderItems.findMany({
        where: eq(outboundOrderItems.outboundOrderId, outboundOrderId),
        columns: { productionJobId: true },
      });

      const jobIds = [
        ...new Set(
          itemsToConfirm
            .map((item) => item.productionJobId)
            .filter((jobId): jobId is string => jobId !== null),
        ),
      ];

      for (const jobId of jobIds) {
        const coverage = await getJobQcCoverage(tx, jobId);
        if (coverage.total === 0 || coverage.open > 0) {
          throw new AppException(ErrorCode.E205, HttpStatus.CONFLICT);
        }
      }

      await tx
        .update(outboundOrders)
        .set({ status: OutboundOrderStatus.PENDING_DELIVERY })
        .where(eq(outboundOrders.id, outboundOrderId));
    });
  }

  /** `PENDING_DELIVERY → DELIVERED` (không phải `POSTED` — DO không có trạng thái đó, tên hàm chỉ
   * mượn động từ kế toán "post" cho hành vi ghi sổ bên trong). Tự sinh + post 1 `inventory_issues`
   * (`SALES`) đúng các dòng của DO, rồi đóng đơn hàng nếu đã giao đủ. Xem
   * `docs/decisions/production-lifecycle-closing.md`. */
  async postOutboundOrder(
    outboundOrderId: string,
    userId: string,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const outboundOrder = await this.getOutboundOrderForUpdate(
        tx,
        outboundOrderId,
      );

      if (outboundOrder.status !== OutboundOrderStatus.PENDING_DELIVERY) {
        throw new AppException(ErrorCode.E237, HttpStatus.CONFLICT);
      }

      const warehouseId = await this.resolveFgWarehouseId(tx);

      const itemsToDeliver = await tx
        .select({
          itemId: outboundOrderItems.itemId,
          quantity: outboundOrderItems.quantity,
          orderItemId: outboundOrderItems.orderItemId,
        })
        .from(outboundOrderItems)
        .where(eq(outboundOrderItems.outboundOrderId, outboundOrderId));

      const issueDate = new Date();
      const issueCode = await this.generateSalesIssueCode(tx, issueDate);

      const [inventoryIssue] = await tx
        .insert(inventoryIssues)
        .values({
          code: issueCode,
          warehouseId,
          issueType: InventoryIssueType.SALES,
          status: InventoryDocumentStatus.POSTED,
          issueDate,
          postedBy: userId,
          postedAt: issueDate,
          createdBy: userId,
        })
        .returning({ id: inventoryIssues.id });

      await tx.insert(inventoryIssueItems).values(
        itemsToDeliver.map((item) => ({
          issueId: inventoryIssue.id,
          itemId: item.itemId,
          quantity: item.quantity,
          orderItemId: item.orderItemId,
        })),
      );

      const postingLines: InventoryPostingLine[] = itemsToDeliver.map(
        (item) => ({
          itemId: item.itemId,
          // Xuất luôn trừ tồn — dấu âm, cùng khuôn `InventoryIssuesService.postInventoryIssue`.
          signedQuantity: -item.quantity,
          type: InventoryTransactionType.ISSUE,
          orderItemId: item.orderItemId,
        }),
      );

      await this.inventoryPostingService.postDocument(tx, {
        warehouseId,
        referenceType: InventoryReferenceType.INVENTORY_ISSUE,
        referenceId: inventoryIssue.id,
        transactionDate: issueDate,
        createdBy: userId,
        lines: postingLines,
      });

      await tx
        .update(outboundOrders)
        .set({ status: OutboundOrderStatus.DELIVERED })
        .where(eq(outboundOrders.id, outboundOrderId));

      await this.closeOrdersIfFullyDelivered(
        tx,
        itemsToDeliver.map((item) => item.orderItemId),
      );
    });
  }

  /** `deliver` cần đúng 1 kho `type = FG` để tự sinh phiếu xuất — DO/`outbound_order_items` không
   * giữ cột kho (thực tế hiện chỉ có `KHO-TP`). 0 hoặc >1 kho FG thì báo lỗi thay vì đoán, xem
   * `docs/decisions/production-lifecycle-closing.md`. */
  private async resolveFgWarehouseId(tx: DbTransaction): Promise<string> {
    const fgWarehouses = await tx
      .select({ id: warehouses.id })
      .from(warehouses)
      .where(eq(warehouses.type, WarehouseType.FG));

    if (fgWarehouses.length !== 1) {
      throw new AppException(ErrorCode.E238, HttpStatus.CONFLICT);
    }

    return fgWarehouses[0].id;
  }

  /** Copy có chủ ý từ `InventoryIssuesService.generateIssueCode` (`private`, khác module) — cùng
   * quy ước "copy có chủ ý" đã dùng ở `orders.query.ts` cho subquery xuyên domain. */
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

  /** Với mỗi đơn bị đụng bởi lô hàng vừa giao (1 DO có thể gộp nhiều đơn cùng khách): mọi dòng
   * `order_items` còn `NORMAL` đã `issuedQty >= quantity` (tính lại trong transaction này, đọc
   * đúng bút toán vừa ghi ở trên) → đơn đó chuyển `COMPLETED`. Chỉ đóng đơn đang `IN_PROGRESS`,
   * không đụng đơn ở trạng thái khác. */
  private async closeOrdersIfFullyDelivered(
    tx: DbTransaction,
    deliveredOrderItemIds: string[],
  ): Promise<void> {
    const affectedOrders = await tx
      .selectDistinct({ orderId: orderItems.orderId })
      .from(orderItems)
      .where(inArray(orderItems.id, deliveredOrderItemIds));

    const issuedByItem = issuedQuantityByOrderItemIdSubquery(tx);

    for (const { orderId } of affectedOrders) {
      const lines = await tx
        .select({
          quantity: orderItems.quantity,
          issuedQty: issuedByItem.issuedQty,
        })
        .from(orderItems)
        .leftJoin(issuedByItem, eq(issuedByItem.orderItemId, orderItems.id))
        .where(
          and(
            eq(orderItems.orderId, orderId),
            eq(orderItems.status, OrderItemStatus.NORMAL),
          ),
        );

      const fullyDelivered = lines.every(
        (line) => (line.issuedQty ?? 0) >= line.quantity,
      );

      if (fullyDelivered) {
        await tx
          .update(orders)
          .set({ status: OrderStatus.COMPLETED })
          .where(
            and(
              eq(orders.id, orderId),
              eq(orders.status, OrderStatus.IN_PROGRESS),
            ),
          );
      }
    }
  }

  /** Khoá dòng phiếu (`FOR UPDATE`) rồi trả về — chỉ gọi bên trong transaction, cùng lý do
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

  /** `DO-{yyMMdd}-{seq trong ngày}` — ngày lấy từ **lúc tạo phiếu** (`outboundOrders.createdAt`,
   * khớp mẫu mockup "DO-250608-001" đi cùng "Ngày tạo" 08/06), không phải `fulfillmentDate` (ngày
   * giao có thể ở tương lai) — khác `generateReceiptCode` dùng `receiptDate` vì đó là ngày nghiệp
   * vụ của phiếu nhập, còn DO không có trường ngày nào đóng vai trò đó. `document_sequences.year`
   * bị mượn làm khoá reset-theo-ngày ở đây — encode nguyên YYMMDD (không phải năm thật) để mỗi
   * ngày có một dãy số atomic riêng, tên cột không đổi vì dùng chung schema với mọi loại chứng từ
   * khác. */
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
