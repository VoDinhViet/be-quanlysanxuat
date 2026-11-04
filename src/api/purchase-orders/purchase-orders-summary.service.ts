import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, sql } from 'drizzle-orm';

import { limitOf } from '../../common/summary/summary.dto';
import {
  asNumber,
  asText,
  dateRangeConditions,
  daysSince,
  equalsText,
  TODAY,
} from '../../common/summary/summary.sql';
import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import {
  InventoryDocumentStatus,
  inventoryReceiptItems,
  inventoryReceipts,
  InventoryReceiptType,
  purchaseOrderItems,
  purchaseOrders,
  PurchaseOrderStatus,
  suppliers,
} from '../../database/schemas';
import { GetOverduePurchaseOrdersReqDto } from './dto/get-overdue-purchase-orders.req.dto';
import { GetPurchaseOrderSupplierValueSummaryReqDto } from './dto/get-purchase-order-supplier-value-summary.req.dto';
import { OverduePurchaseOrderResDto } from './dto/overdue-purchase-order.res.dto';
import { PurchaseOrderSupplierValueResDto } from './dto/purchase-order-supplier-value.res.dto';
import { isOpenPurchaseOrder } from './purchase-orders.predicate';

@Injectable()
export class PurchaseOrdersSummaryService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  getSupplierValueSummary(
    reqDto: GetPurchaseOrderSupplierValueSummaryReqDto,
  ): Promise<PurchaseOrderSupplierValueResDto[]> {
    const totalValue = sql<number>`coalesce(sum(coalesce(${purchaseOrderItems.quotationQuantity}, ${purchaseOrderItems.quantity}) * ${purchaseOrderItems.unitPrice}), 0)::float8`;

    return this.db
      .select({
        supplierId: suppliers.id,
        supplierName: suppliers.name,
        totalValue,
        orderCount: sql<number>`count(DISTINCT ${purchaseOrders.id})::int`,
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
            reqDto.status ?? PurchaseOrderStatus.ORDERED,
          ),
          ...dateRangeConditions(sql`${purchaseOrders.orderDate}`, reqDto),
        ),
      )
      .groupBy(suppliers.id, suppliers.name)
      .orderBy(desc(totalValue), asc(suppliers.name))
      .limit(limitOf(reqDto));
  }

  // Nhận hàng tính từ phiếu nhập mua đã ghi sổ; phiếu trả hàng chưa trừ vào số đã nhận
  getOverduePurchaseOrders(
    reqDto: GetOverduePurchaseOrdersReqDto,
  ): Promise<OverduePurchaseOrderResDto[]> {
    const orderedLines = this.orderedQuantityByPurchaseOrder();
    const receivedLines = this.postedReceivedQuantityByPurchaseOrder();
    const receivedQuantity = sql<number>`coalesce(${receivedLines.quantity}, 0)`;

    return this.db
      .select({
        id: purchaseOrders.id,
        code: purchaseOrders.code,
        supplierName: suppliers.name,
        expectedDate: asText(purchaseOrders.expectedDate),
        daysOverdue: daysSince(purchaseOrders.expectedDate),
        orderedQuantity: asNumber(orderedLines.quantity),
        receivedQuantity: asNumber(receivedQuantity),
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
          isOpenPurchaseOrder(),
          sql`${purchaseOrders.expectedDate} < ${TODAY}`,
          sql`${receivedQuantity} < ${orderedLines.quantity}`,
        ),
      )
      .orderBy(asc(purchaseOrders.expectedDate), asc(purchaseOrders.code))
      .limit(limitOf(reqDto));
  }

  // Alias khác nhau giữa hai subquery vì Drizzle in cột alias không kèm tên bảng con: trùng tên
  // thì SQL báo mơ hồ
  private orderedQuantityByPurchaseOrder() {
    return this.db
      .select({
        purchaseOrderId: purchaseOrderItems.purchaseOrderId,
        quantity: sql<number>`sum(${purchaseOrderItems.quantity})`.as(
          'ordered_quantity',
        ),
      })
      .from(purchaseOrderItems)
      .groupBy(purchaseOrderItems.purchaseOrderId)
      .as('ordered');
  }

  private postedReceivedQuantityByPurchaseOrder() {
    return this.db
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
          eq(inventoryReceipts.status, InventoryDocumentStatus.POSTED),
          eq(inventoryReceipts.receiptType, InventoryReceiptType.PURCHASE),
        ),
      )
      .groupBy(inventoryReceipts.purchaseOrderId)
      .as('received');
  }
}
