import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import {
  inventoryBalances,
  inventoryReceiptItems,
  inventoryReceipts,
  items,
  paymentRequests,
  purchaseOrderItems,
  purchaseOrders,
  purchaseRequestItems,
  purchaseRequests,
  suppliers,
} from '../../database/schemas';

import {
  IntegrationResultResDto,
  LimitReqDto,
} from './dto/integration-common.dto';
import {
  InventoryRankingOrder,
  InventoryRankingReqDto,
  PaymentRequestValueReqDto,
  PurchaseValueBySupplierReqDto,
} from './dto/integration-purchasing.req.dto';
import { IntegrationQueryService, TODAY } from './integration-query.service';

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
}
