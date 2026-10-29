import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { and, asc, desc, eq, isNull, ne, sql } from 'drizzle-orm';

import {
  inventoryBalances,
  inventoryReceiptItems,
  inventoryReceipts,
  items,
  paymentRequests,
  purchaseOrderItems,
  purchaseOrders,
  purchaseQuotations,
  purchaseRequestItems,
  purchaseRequests,
  supplierReturns,
  suppliers,
} from '../../database/schemas';
import { vnTimestamp } from '../../common/utils/time';

import {
  IntegrationResultResDto,
  LimitReqDto,
} from './dto/integration-common.dto';
import {
  InventoryRankingOrder,
  InventoryRankingReqDto,
  PaymentRequestValueReqDto,
  PurchasingSummaryEntity,
  PurchasingSummaryGroupBy,
  PurchasingSummaryReqDto,
  PurchasingWatchKind,
  PurchasingWatchlistReqDto,
  PurchaseValueBySupplierReqDto,
} from './dto/integration-purchasing.req.dto';
import {
  dateRangeConditions,
  equalsText,
  inTexts,
  IntegrationQueryService,
  TODAY,
} from './integration-query.service';

const DEFAULT_LIST_LIMIT = 20;
const DEFAULT_RANKING_LIMIT = 10;
const DEFAULT_PURCHASE_STATUS = 'ORDERED';

@Injectable()
export class IntegrationPurchasingService {
  constructor(private readonly queryService: IntegrationQueryService) {}

  // Tồn kho nằm ở nhóm này vì chỉ phục vụ câu hỏi mua hàng/vật tư dưới mức tồn tối thiểu
  inventoryRanking(
    reqDto: InventoryRankingReqDto,
  ): Promise<IntegrationResultResDto> {
    const direction =
      reqDto.order === InventoryRankingOrder.LOWEST
        ? sql.raw('ASC')
        : sql.raw('DESC');
    const limit = reqDto.limit ?? DEFAULT_RANKING_LIMIT;

    if (reqDto.belowMinStock) {
      return this.queryService.run(
        'inventory_ranking',
        ['code', 'name', 'quantity', 'ton_toi_thieu'],
        sql`SELECT ${items.code}, ${items.name}, ${inventoryBalances.quantity}::float8 AS quantity,
          ${items.minStock}::float8 AS ton_toi_thieu
          FROM ${inventoryBalances} JOIN ${items} ON ${items.id} = ${inventoryBalances.itemId}
          WHERE ${items.deletedAt} IS NULL AND ${items.minStock} > 0 AND ${inventoryBalances.quantity} < ${items.minStock}
          ORDER BY ${inventoryBalances.quantity} ${direction} LIMIT ${limit}`,
      );
    }
    // Xếp thấp nhất mà không loại dòng hết hàng thì toàn dòng tồn bằng 0, vô nghĩa: chỉ lấy còn hàng
    const isInStockOnly =
      !!reqDto.inStockOnly || reqDto.order === InventoryRankingOrder.LOWEST;
    const stockCondition = isInStockOnly
      ? sql`WHERE ${inventoryBalances.quantity} > 0`
      : sql``;
    return this.queryService.run(
      'inventory_ranking',
      ['code', 'name', 'quantity'],
      sql`SELECT ${items.code}, ${items.name}, ${inventoryBalances.quantity}::float8 AS quantity
        FROM ${inventoryBalances} JOIN ${items} ON ${items.id} = ${inventoryBalances.itemId} ${stockCondition}
        ORDER BY ${inventoryBalances.quantity} ${direction} LIMIT ${limit}`,
    );
  }

  purchaseValueBySupplier(
    reqDto: PurchaseValueBySupplierReqDto,
  ): Promise<IntegrationResultResDto> {
    const withOrderCount = reqDto.withOrderCount ?? false;
    const countColumn = withOrderCount
      ? sql`, COUNT(DISTINCT ${purchaseOrders.id})::int AS so_don_mua`
      : sql``;
    const columns = withOrderCount
      ? ['name', 'gia_tri', 'so_don_mua']
      : ['name', 'gia_tri'];

    return this.queryService.run(
      'purchase_value_by_supplier',
      columns,
      sql`SELECT ${suppliers.name}, SUM(coalesce(${purchaseOrderItems.quotationQuantity}, ${purchaseOrderItems.quantity}) * ${purchaseOrderItems.unitPrice})::float8 AS gia_tri${countColumn}
        FROM ${purchaseOrders}
        JOIN ${purchaseOrderItems} ON ${purchaseOrderItems.purchaseOrderId} = ${purchaseOrders.id}
        JOIN ${suppliers} ON ${suppliers.id} = ${purchaseOrders.supplierId}
        WHERE ${purchaseOrders.status}::text = ${reqDto.status ?? DEFAULT_PURCHASE_STATUS}
        GROUP BY ${suppliers.name} ORDER BY gia_tri DESC`,
    );
  }

  // Nhận hàng tính từ phiếu nhập mua đã ghi sổ; phiếu trả hàng chưa trừ vào số đã nhận
  overduePurchaseOrders(reqDto: LimitReqDto): Promise<IntegrationResultResDto> {
    return this.queryService.run(
      'overdue_purchase_orders',
      [
        'don_mua',
        'nha_cung_cap',
        'ngay_du_kien',
        'so_ngay_tre',
        'so_luong_dat',
        'so_luong_da_nhan',
      ],
      sql`SELECT ${purchaseOrders.code} AS don_mua, ${suppliers.name} AS nha_cung_cap,
        ${purchaseOrders.expectedDate}::text AS ngay_du_kien,
        (${TODAY} - ${purchaseOrders.expectedDate})::int AS so_ngay_tre,
        ordered.quantity::float8 AS so_luong_dat,
        COALESCE(received.quantity, 0)::float8 AS so_luong_da_nhan
        FROM ${purchaseOrders} JOIN ${suppliers} ON ${suppliers.id} = ${purchaseOrders.supplierId}
        JOIN (SELECT purchase_order_id, SUM(quantity) AS quantity
          FROM purchase_order_items GROUP BY purchase_order_id) ordered
          ON ordered.purchase_order_id = ${purchaseOrders.id}
        LEFT JOIN (SELECT ${inventoryReceipts.purchaseOrderId}, SUM(${inventoryReceiptItems.quantity}) AS quantity
          FROM ${inventoryReceipts} JOIN ${inventoryReceiptItems} ON ${inventoryReceiptItems.receiptId} = ${inventoryReceipts.id}
          WHERE ${inventoryReceipts.status}::text = 'POSTED' AND ${inventoryReceipts.receiptType}::text = 'PURCHASE'
          GROUP BY ${inventoryReceipts.purchaseOrderId}) received ON received.purchase_order_id = ${purchaseOrders.id}
        WHERE ${purchaseOrders.status}::text = 'ORDERED' AND ${purchaseOrders.closedAt} IS NULL
        AND ${purchaseOrders.expectedDate} < ${TODAY}
        AND COALESCE(received.quantity, 0) < ordered.quantity
        ORDER BY so_ngay_tre DESC LIMIT ${reqDto.limit ?? DEFAULT_LIST_LIMIT}`,
    );
  }

  // Dòng đề nghị còn hiệu lực mà chưa nằm trong đơn mua nào chưa huỷ
  stuckPurchaseRequests(reqDto: LimitReqDto): Promise<IntegrationResultResDto> {
    return this.queryService.run(
      'stuck_purchase_requests',
      [
        'de_nghi_mua',
        'ngay_can',
        'so_ngay_tre',
        'so_dong_chua_len_don',
        'so_luong',
      ],
      sql`SELECT ${purchaseRequests.code} AS de_nghi_mua, ${purchaseRequests.neededDate}::text AS ngay_can,
        (${TODAY} - ${purchaseRequests.neededDate})::int AS so_ngay_tre,
        COUNT(*)::int AS so_dong_chua_len_don, SUM(${purchaseRequestItems.quantity})::float8 AS so_luong
        FROM ${purchaseRequests}
        JOIN ${purchaseRequestItems} ON ${purchaseRequestItems.purchaseRequestId} = ${purchaseRequests.id}
        LEFT JOIN (SELECT ${purchaseOrderItems.purchaseRequestItemId} FROM ${purchaseOrderItems}
          JOIN ${purchaseOrders} ON ${purchaseOrders.id} = ${purchaseOrderItems.purchaseOrderId}
          WHERE ${purchaseOrders.status}::text <> 'CANCELLED') ordered
          ON ordered.purchase_request_item_id = ${purchaseRequestItems.id}
        WHERE ${purchaseRequests.status}::text = 'APPROVED' AND ${purchaseRequestItems.cancelledAt} IS NULL
        AND ordered.purchase_request_item_id IS NULL
        GROUP BY ${purchaseRequests.code}, ${purchaseRequests.neededDate} ORDER BY ${purchaseRequests.neededDate}
        LIMIT ${reqDto.limit ?? DEFAULT_LIST_LIMIT}`,
    );
  }

  overduePaymentRequests(
    reqDto: LimitReqDto,
  ): Promise<IntegrationResultResDto> {
    return this.queryService.run(
      'overdue_payment_requests',
      ['de_nghi_thanh_toan', 'nha_cung_cap', 'han', 'so_ngay_tre', 'gia_tri'],
      sql`SELECT ${paymentRequests.code} AS de_nghi_thanh_toan, ${suppliers.name} AS nha_cung_cap,
        ${paymentRequests.dueDate}::text AS han, (${TODAY} - ${paymentRequests.dueDate})::int AS so_ngay_tre,
        ${paymentRequests.requestedAmount}::float8 AS gia_tri
        FROM ${paymentRequests}
        JOIN ${purchaseOrders} ON ${purchaseOrders.id} = ${paymentRequests.purchaseOrderId}
        JOIN ${suppliers} ON ${suppliers.id} = ${purchaseOrders.supplierId}
        WHERE ${paymentRequests.status}::text IN ('DRAFT', 'PENDING', 'REJECTED') AND ${paymentRequests.dueDate} < ${TODAY}
        ORDER BY so_ngay_tre DESC LIMIT ${reqDto.limit ?? DEFAULT_LIST_LIMIT}`,
    );
  }

  paymentRequestValue(
    reqDto: PaymentRequestValueReqDto,
  ): Promise<IntegrationResultResDto> {
    if (reqDto.status) {
      return this.queryService.run(
        'payment_request_value',
        ['so_de_nghi', 'tong_gia_tri'],
        sql`SELECT COUNT(*)::int AS so_de_nghi, SUM(request_value)::float8 AS tong_gia_tri
          FROM payment_requests WHERE status::text = ${reqDto.status}`,
      );
    }
    return this.queryService.run(
      'payment_request_value',
      ['status', 'so_de_nghi', 'tong_gia_tri'],
      sql`SELECT status::text AS status, COUNT(*)::int AS so_de_nghi,
        SUM(request_value)::float8 AS tong_gia_tri
        FROM payment_requests GROUP BY status ORDER BY tong_gia_tri DESC`,
    );
  }

  summarizePurchasing(
    reqDto: PurchasingSummaryReqDto,
  ): Promise<IntegrationResultResDto> {
    const combination = `${reqDto.entity}+${reqDto.groupBy}`;
    switch (combination) {
      case `${PurchasingSummaryEntity.PURCHASE_ORDERS}+${PurchasingSummaryGroupBy.SUPPLIER}`:
        return this.summarizePurchaseOrdersBySupplier(reqDto);
      case `${PurchasingSummaryEntity.PAYMENT_REQUESTS}+${PurchasingSummaryGroupBy.STATUS}`:
        return this.summarizePaymentRequestsByStatus(reqDto);
      case `${PurchasingSummaryEntity.QUOTATIONS}+${PurchasingSummaryGroupBy.STATUS}`:
        return this.countQuotationsByStatus(reqDto);
      case `${PurchasingSummaryEntity.SUPPLIER_RETURNS}+${PurchasingSummaryGroupBy.STATUS}`:
        return this.countSupplierReturnsByStatus(reqDto);
      case `${PurchasingSummaryEntity.SUPPLIER_RETURNS}+${PurchasingSummaryGroupBy.SUPPLIER}`:
        return this.countSupplierReturnsBySupplier(reqDto);
      default:
        throw new UnprocessableEntityException(
          `groupBy=${reqDto.groupBy} không áp dụng cho entity=${reqDto.entity}`,
        );
    }
  }

  listPurchasingWatchlist(
    reqDto: PurchasingWatchlistReqDto,
  ): Promise<IntegrationResultResDto> {
    switch (reqDto.kind) {
      case PurchasingWatchKind.OVERDUE_PURCHASE_ORDERS:
        return this.listOverduePurchaseOrders(reqDto);
      case PurchasingWatchKind.STUCK_REQUESTS:
        return this.listStuckRequests(reqDto);
      case PurchasingWatchKind.OVERDUE_PAYMENTS:
        return this.listOverduePayments(reqDto);
    }
  }

  private summarizePurchaseOrdersBySupplier(
    reqDto: PurchasingSummaryReqDto,
  ): Promise<IntegrationResultResDto> {
    const columns: Array<'name' | 'gia_tri' | 'so_don_mua'> = [
      'name',
      'gia_tri',
    ];
    if (reqDto.withOrderCount) {
      columns.push('so_don_mua');
    }
    const orderValue = sql<number>`sum(coalesce(${purchaseOrderItems.quotationQuantity}, ${purchaseOrderItems.quantity}) * ${purchaseOrderItems.unitPrice})::float8`;
    return this.queryService.query('purchasing_summary', columns, (tx) =>
      tx
        .select({
          name: suppliers.name,
          gia_tri: orderValue,
          so_don_mua: sql<number>`count(DISTINCT ${purchaseOrders.id})::int`,
        })
        .from(purchaseOrders)
        .innerJoin(
          purchaseOrderItems,
          eq(purchaseOrderItems.purchaseOrderId, purchaseOrders.id),
        )
        .innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
        .where(
          and(
            equalsText(
              purchaseOrders.status,
              reqDto.status ?? DEFAULT_PURCHASE_STATUS,
            ),
            ...dateRangeConditions(sql`${purchaseOrders.orderDate}`, reqDto),
          ),
        )
        .groupBy(suppliers.name)
        .orderBy(desc(orderValue), asc(suppliers.name)),
    );
  }

  private countQuotationsByStatus(
    reqDto: PurchasingSummaryReqDto,
  ): Promise<IntegrationResultResDto> {
    return this.queryService.query(
      'purchasing_summary',
      ['status', 'so_bao_gia'],
      (tx) =>
        tx
          .select({
            status: sql<string>`${purchaseQuotations.status}::text`,
            so_bao_gia: sql<number>`count(*)::int`,
          })
          .from(purchaseQuotations)
          .where(
            and(
              ...dateRangeConditions(
                vnTimestamp(purchaseQuotations.createdAt),
                reqDto,
              ),
            ),
          )
          .groupBy(purchaseQuotations.status)
          .orderBy(desc(sql`count(*)`), asc(purchaseQuotations.status)),
    );
  }

  private countSupplierReturnsByStatus(
    reqDto: PurchasingSummaryReqDto,
  ): Promise<IntegrationResultResDto> {
    return this.queryService.query(
      'purchasing_summary',
      ['status', 'so_phieu', 'so_luong'],
      (tx) =>
        tx
          .select({
            status: sql<string>`${supplierReturns.status}::text`,
            so_phieu: sql<number>`count(*)::int`,
            so_luong: sql<number>`sum(${supplierReturns.quantity})::float8`,
          })
          .from(supplierReturns)
          .where(
            and(
              ...dateRangeConditions(
                sql`${supplierReturns.returnDate}`,
                reqDto,
              ),
            ),
          )
          .groupBy(supplierReturns.status)
          .orderBy(desc(sql`count(*)`), asc(supplierReturns.status)),
    );
  }

  private countSupplierReturnsBySupplier(
    reqDto: PurchasingSummaryReqDto,
  ): Promise<IntegrationResultResDto> {
    const filters = [
      ...dateRangeConditions(sql`${supplierReturns.returnDate}`, reqDto),
    ];
    if (reqDto.status) {
      filters.push(equalsText(supplierReturns.status, reqDto.status));
    }
    return this.queryService.query(
      'purchasing_summary',
      ['name', 'so_phieu', 'so_luong'],
      (tx) =>
        tx
          .select({
            name: suppliers.name,
            so_phieu: sql<number>`count(*)::int`,
            so_luong: sql<number>`sum(${supplierReturns.quantity})::float8`,
          })
          .from(supplierReturns)
          .innerJoin(suppliers, eq(suppliers.id, supplierReturns.supplierId))
          .where(and(...filters))
          .groupBy(suppliers.name)
          .orderBy(desc(sql`count(*)`), asc(suppliers.name)),
    );
  }

  private summarizePaymentRequestsByStatus(
    reqDto: PurchasingSummaryReqDto,
  ): Promise<IntegrationResultResDto> {
    const filters = [
      ...dateRangeConditions(vnTimestamp(paymentRequests.createdAt), reqDto),
    ];
    if (reqDto.status) {
      filters.push(equalsText(paymentRequests.status, reqDto.status));
    }
    const totalValue = sql<number>`sum(${paymentRequests.requestedAmount})::float8`;
    return this.queryService.query(
      'purchasing_summary',
      ['status', 'so_de_nghi', 'tong_gia_tri'],
      (tx) =>
        tx
          .select({
            status: sql<string>`${paymentRequests.status}::text`,
            so_de_nghi: sql<number>`count(*)::int`,
            tong_gia_tri: totalValue,
          })
          .from(paymentRequests)
          .where(and(...filters))
          .groupBy(paymentRequests.status)
          .orderBy(desc(totalValue), asc(paymentRequests.status)),
    );
  }

  // Nhận hàng tính từ phiếu nhập mua đã ghi sổ; phiếu trả hàng chưa trừ vào số đã nhận
  private listOverduePurchaseOrders(
    reqDto: PurchasingWatchlistReqDto,
  ): Promise<IntegrationResultResDto> {
    return this.queryService.query(
      'purchasing_watchlist',
      [
        'don_mua',
        'nha_cung_cap',
        'ngay_du_kien',
        'so_ngay_tre',
        'so_luong_dat',
        'so_luong_da_nhan',
      ],
      (tx) => {
        // Alias khác nhau vì Drizzle in cột alias không kèm tên bảng con: trùng tên thì SQL báo mơ hồ
        const orderedLines = tx
          .select({
            purchaseOrderId: purchaseOrderItems.purchaseOrderId,
            quantity: sql<number>`sum(${purchaseOrderItems.quantity})`.as(
              'ordered_quantity',
            ),
          })
          .from(purchaseOrderItems)
          .groupBy(purchaseOrderItems.purchaseOrderId)
          .as('ordered');
        const receivedLines = tx
          .select({
            purchaseOrderId: inventoryReceipts.purchaseOrderId,
            quantity: sql<number>`sum(${inventoryReceiptItems.quantity})`.as(
              'received_quantity',
            ),
          })
          .from(inventoryReceipts)
          .innerJoin(
            inventoryReceiptItems,
            eq(inventoryReceiptItems.receiptId, inventoryReceipts.id),
          )
          .where(
            and(
              equalsText(inventoryReceipts.status, 'POSTED'),
              equalsText(inventoryReceipts.receiptType, 'PURCHASE'),
            ),
          )
          .groupBy(inventoryReceipts.purchaseOrderId)
          .as('received');
        const receivedQuantity = sql<number>`coalesce(${receivedLines.quantity}, 0)`;

        return tx
          .select({
            don_mua: purchaseOrders.code,
            nha_cung_cap: suppliers.name,
            ngay_du_kien: sql<string>`${purchaseOrders.expectedDate}::text`,
            so_ngay_tre: sql<number>`(${TODAY} - ${purchaseOrders.expectedDate})::int`,
            so_luong_dat: sql<number>`${orderedLines.quantity}::float8`,
            so_luong_da_nhan: sql<number>`${receivedQuantity}::float8`,
          })
          .from(purchaseOrders)
          .innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
          .innerJoin(
            orderedLines,
            eq(orderedLines.purchaseOrderId, purchaseOrders.id),
          )
          .leftJoin(
            receivedLines,
            eq(receivedLines.purchaseOrderId, purchaseOrders.id),
          )
          .where(
            and(
              equalsText(purchaseOrders.status, 'ORDERED'),
              isNull(purchaseOrders.closedAt),
              sql`${purchaseOrders.expectedDate} < ${TODAY}`,
              sql`${receivedQuantity} < ${orderedLines.quantity}`,
            ),
          )
          .orderBy(asc(purchaseOrders.expectedDate), asc(purchaseOrders.code))
          .limit(reqDto.limit ?? DEFAULT_LIST_LIMIT);
      },
    );
  }

  // Dòng đề nghị còn hiệu lực mà chưa nằm trong đơn mua nào chưa huỷ
  private listStuckRequests(
    reqDto: PurchasingWatchlistReqDto,
  ): Promise<IntegrationResultResDto> {
    return this.queryService.query(
      'purchasing_watchlist',
      [
        'de_nghi_mua',
        'ngay_can',
        'so_ngay_tre',
        'so_dong_chua_len_don',
        'so_luong',
      ],
      (tx) => {
        const orderedRequestLines = tx
          .select({
            purchaseRequestItemId: purchaseOrderItems.purchaseRequestItemId,
          })
          .from(purchaseOrderItems)
          .innerJoin(
            purchaseOrders,
            eq(purchaseOrders.id, purchaseOrderItems.purchaseOrderId),
          )
          .where(ne(sql`${purchaseOrders.status}::text`, 'CANCELLED'))
          .as('ordered');

        return tx
          .select({
            de_nghi_mua: purchaseRequests.code,
            ngay_can: sql<string>`${purchaseRequests.neededDate}::text`,
            so_ngay_tre: sql<number>`(${TODAY} - ${purchaseRequests.neededDate})::int`,
            so_dong_chua_len_don: sql<number>`count(*)::int`,
            so_luong: sql<number>`sum(${purchaseRequestItems.quantity})::float8`,
          })
          .from(purchaseRequests)
          .innerJoin(
            purchaseRequestItems,
            eq(purchaseRequestItems.purchaseRequestId, purchaseRequests.id),
          )
          .leftJoin(
            orderedRequestLines,
            eq(
              orderedRequestLines.purchaseRequestItemId,
              purchaseRequestItems.id,
            ),
          )
          .where(
            and(
              equalsText(purchaseRequests.status, 'APPROVED'),
              isNull(purchaseRequestItems.cancelledAt),
              isNull(orderedRequestLines.purchaseRequestItemId),
            ),
          )
          .groupBy(purchaseRequests.code, purchaseRequests.neededDate)
          .orderBy(asc(purchaseRequests.neededDate), asc(purchaseRequests.code))
          .limit(reqDto.limit ?? DEFAULT_LIST_LIMIT);
      },
    );
  }

  private listOverduePayments(
    reqDto: PurchasingWatchlistReqDto,
  ): Promise<IntegrationResultResDto> {
    return this.queryService.query(
      'purchasing_watchlist',
      ['de_nghi_thanh_toan', 'nha_cung_cap', 'han', 'so_ngay_tre', 'gia_tri'],
      (tx) =>
        tx
          .select({
            de_nghi_thanh_toan: paymentRequests.code,
            nha_cung_cap: suppliers.name,
            han: sql<string>`${paymentRequests.dueDate}::text`,
            so_ngay_tre: sql<number>`(${TODAY} - ${paymentRequests.dueDate})::int`,
            gia_tri: sql<number>`${paymentRequests.requestedAmount}::float8`,
          })
          .from(paymentRequests)
          .innerJoin(
            purchaseOrders,
            eq(purchaseOrders.id, paymentRequests.purchaseOrderId),
          )
          .innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
          .where(
            and(
              inTexts(paymentRequests.status, ['DRAFT', 'PENDING', 'REJECTED']),
              sql`${paymentRequests.dueDate} < ${TODAY}`,
            ),
          )
          .orderBy(asc(paymentRequests.dueDate), asc(paymentRequests.code))
          .limit(reqDto.limit ?? DEFAULT_LIST_LIMIT),
    );
  }
}
