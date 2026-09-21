import { Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { eq, inArray, or } from 'drizzle-orm';

import { DRIZZLE } from '../../database/database.module';
import type { Database } from '../../database/database.type';
import {
  inventoryReceiptItems,
  inventoryReceipts,
  purchaseOrderItems,
  purchaseOrders,
  purchaseQuotationItemAllocations,
  purchaseQuotationItemSuppliers,
  purchaseQuotationItems,
  purchaseQuotations,
  purchaseRequestItems,
  purchaseRequests,
} from '../../database/schemas';
import { PurchaseChainNotesResDto } from './dto/purchase-chain-notes.res.dto';

type ChainIds = {
  requestIds: string[];
  quotationIds: string[];
  orderIds: string[];
  receiptIds: string[];
};

/**
 * Đọc gộp ghi chú (`note`) của toàn bộ chứng từ liên quan trong chuỗi mua hàng
 * ĐXMH → Báo giá → Đơn mua → Kho, xuất phát từ bất kỳ 1 trong 4 loại — không sở hữu nghiệp vụ của
 * domain nào, xem `docs/decisions/purchase-chain-notes.md` cho sơ đồ FK đầy đủ.
 */
@Injectable()
export class PurchaseNotesService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async getChainNotesFromRequest(
    requestId: string,
  ): Promise<PurchaseChainNotesResDto> {
    const { itemIds } = await this.linkRequestItemsAndRequests([requestId], []);
    const { quotationIds } = await this.linkRequestItemsAndQuotations(
      itemIds,
      [],
    );
    const { orderIds } = await this.linkRequestItemsAndOrders(itemIds, []);
    const { receiptIds } = await this.linkReceiptsAndRequestsOrOrders(
      [],
      [requestId],
      orderIds,
    );

    return this.selectNotesByIds({
      requestIds: [requestId],
      quotationIds,
      orderIds,
      receiptIds,
    });
  }

  async getChainNotesFromQuotation(
    quotationId: string,
  ): Promise<PurchaseChainNotesResDto> {
    const { itemIds } = await this.linkRequestItemsAndQuotations(
      [],
      [quotationId],
    );
    const { requestIds } = await this.linkRequestItemsAndRequests([], itemIds);
    const { orderIds } = await this.linkOrdersAndQuotations([], [quotationId]);
    const { receiptIds } = await this.linkReceiptsAndRequestsOrOrders(
      [],
      requestIds,
      orderIds,
    );

    return this.selectNotesByIds({
      requestIds,
      quotationIds: [quotationId],
      orderIds,
      receiptIds,
    });
  }

  async getChainNotesFromOrder(
    orderId: string,
  ): Promise<PurchaseChainNotesResDto> {
    const { itemIds } = await this.linkRequestItemsAndOrders([], [orderId]);
    const { requestIds } = await this.linkRequestItemsAndRequests([], itemIds);
    const { quotationIds } = await this.linkOrdersAndQuotations([orderId], []);
    const { receiptIds } = await this.linkReceiptsAndRequestsOrOrders(
      [],
      requestIds,
      [orderId],
    );

    return this.selectNotesByIds({
      requestIds,
      quotationIds,
      orderIds: [orderId],
      receiptIds,
    });
  }

  async getChainNotesFromReceipt(
    receiptId: string,
  ): Promise<PurchaseChainNotesResDto> {
    const { requestIds: seedRequestIds, orderIds: seedOrderIds } =
      await this.linkReceiptsAndRequestsOrOrders([receiptId], [], []);
    const { itemIds } = await this.linkRequestItemsAndOrders([], seedOrderIds);
    const { requestIds: requestIdsViaItems } =
      await this.linkRequestItemsAndRequests([], itemIds);
    const requestIds = [...new Set([...seedRequestIds, ...requestIdsViaItems])];
    const { quotationIds } = await this.linkOrdersAndQuotations(
      seedOrderIds,
      [],
    );

    return this.selectNotesByIds({
      requestIds,
      quotationIds,
      orderIds: seedOrderIds,
      receiptIds: [receiptId],
    });
  }

  // Mỗi helper dưới đây đúng 1 quan hệ trong sơ đồ FK (docs/decisions/purchase-chain-notes.md) —
  // nhận id đã biết ở CẢ 2 phía (phía chưa biết truyền mảng rỗng), trả về id đã khử trùng lặp ở cả
  // 2 phía. Hai mảng vào đều rỗng thì trả rỗng luôn, không query — nhờ vậy 1 helper phục vụ được cả
  // chiều xuôi lẫn chiều ngược, không cần viết riêng từng cặp.

  private async linkRequestItemsAndRequests(
    requestIds: string[],
    itemIds: string[],
  ): Promise<{ requestIds: string[]; itemIds: string[] }> {
    if (!requestIds.length && !itemIds.length) {
      return { requestIds: [], itemIds: [] };
    }

    const requestItems = await this.db
      .select({
        itemId: purchaseRequestItems.id,
        requestId: purchaseRequestItems.purchaseRequestId,
      })
      .from(purchaseRequestItems)
      .where(
        or(
          requestIds.length
            ? inArray(purchaseRequestItems.purchaseRequestId, requestIds)
            : undefined,
          itemIds.length
            ? inArray(purchaseRequestItems.id, itemIds)
            : undefined,
        ),
      );

    return {
      requestIds: [...new Set(requestItems.map((row) => row.requestId))],
      itemIds: [...new Set(requestItems.map((row) => row.itemId))],
    };
  }

  private async linkRequestItemsAndQuotations(
    itemIds: string[],
    quotationIds: string[],
  ): Promise<{ itemIds: string[]; quotationIds: string[] }> {
    if (!itemIds.length && !quotationIds.length) {
      return { itemIds: [], quotationIds: [] };
    }

    const allocations = await this.db
      .select({
        itemId: purchaseQuotationItemAllocations.purchaseRequestItemId,
        quotationId: purchaseQuotationItems.quotationId,
      })
      .from(purchaseQuotationItemAllocations)
      .innerJoin(
        purchaseQuotationItems,
        eq(
          purchaseQuotationItems.id,
          purchaseQuotationItemAllocations.quotationItemId,
        ),
      )
      .where(
        or(
          itemIds.length
            ? inArray(
                purchaseQuotationItemAllocations.purchaseRequestItemId,
                itemIds,
              )
            : undefined,
          quotationIds.length
            ? inArray(purchaseQuotationItems.quotationId, quotationIds)
            : undefined,
        ),
      );

    return {
      itemIds: [...new Set(allocations.map((row) => row.itemId))],
      quotationIds: [...new Set(allocations.map((row) => row.quotationId))],
    };
  }

  private async linkRequestItemsAndOrders(
    itemIds: string[],
    orderIds: string[],
  ): Promise<{ itemIds: string[]; orderIds: string[] }> {
    if (!itemIds.length && !orderIds.length) {
      return { itemIds: [], orderIds: [] };
    }

    const orderItems = await this.db
      .select({
        itemId: purchaseOrderItems.purchaseRequestItemId,
        orderId: purchaseOrderItems.purchaseOrderId,
      })
      .from(purchaseOrderItems)
      .where(
        or(
          itemIds.length
            ? inArray(purchaseOrderItems.purchaseRequestItemId, itemIds)
            : undefined,
          orderIds.length
            ? inArray(purchaseOrderItems.purchaseOrderId, orderIds)
            : undefined,
        ),
      );

    return {
      itemIds: [...new Set(orderItems.map((row) => row.itemId))],
      orderIds: [...new Set(orderItems.map((row) => row.orderId))],
    };
  }

  private async linkOrdersAndQuotations(
    orderIds: string[],
    quotationIds: string[],
  ): Promise<{ orderIds: string[]; quotationIds: string[] }> {
    if (!orderIds.length && !quotationIds.length) {
      return { orderIds: [], quotationIds: [] };
    }

    const [ordersApprovedFromQuotation, ordersUsingQuotedSupplier] =
      await Promise.all([
        this.db
          .select({
            orderId: purchaseOrders.id,
            quotationId: purchaseOrders.quotationId,
          })
          .from(purchaseOrders)
          .where(
            or(
              orderIds.length
                ? inArray(purchaseOrders.id, orderIds)
                : undefined,
              quotationIds.length
                ? inArray(purchaseOrders.quotationId, quotationIds)
                : undefined,
            ),
          ),
        this.db
          .select({
            orderId: purchaseOrderItems.purchaseOrderId,
            quotationId: purchaseQuotationItems.quotationId,
          })
          .from(purchaseOrderItems)
          .innerJoin(
            purchaseQuotationItemSuppliers,
            eq(
              purchaseQuotationItemSuppliers.id,
              purchaseOrderItems.quotationItemSupplierId,
            ),
          )
          .innerJoin(
            purchaseQuotationItems,
            eq(
              purchaseQuotationItems.id,
              purchaseQuotationItemSuppliers.quotationItemId,
            ),
          )
          .where(
            or(
              orderIds.length
                ? inArray(purchaseOrderItems.purchaseOrderId, orderIds)
                : undefined,
              quotationIds.length
                ? inArray(purchaseQuotationItems.quotationId, quotationIds)
                : undefined,
            ),
          ),
      ]);

    return {
      orderIds: [
        ...new Set([
          ...ordersApprovedFromQuotation.map((row) => row.orderId),
          ...ordersUsingQuotedSupplier.map((row) => row.orderId),
        ]),
      ],
      quotationIds: [
        ...new Set(
          [
            ...ordersApprovedFromQuotation.map((row) => row.quotationId),
            ...ordersUsingQuotedSupplier.map((row) => row.quotationId),
          ].filter((id): id is string => id !== null),
        ),
      ],
    };
  }

  private async linkReceiptsAndRequestsOrOrders(
    receiptIds: string[],
    requestIds: string[],
    orderIds: string[],
  ): Promise<{
    receiptIds: string[];
    requestIds: string[];
    orderIds: string[];
  }> {
    if (!receiptIds.length && !requestIds.length && !orderIds.length) {
      return { receiptIds: [], requestIds: [], orderIds: [] };
    }

    const [receiptsLinkedDirectly, receiptsLinkedViaReceivedItems] =
      await Promise.all([
        this.db
          .select({
            receiptId: inventoryReceipts.id,
            requestId: inventoryReceipts.purchaseRequestId,
            orderId: inventoryReceipts.purchaseOrderId,
          })
          .from(inventoryReceipts)
          .where(
            or(
              receiptIds.length
                ? inArray(inventoryReceipts.id, receiptIds)
                : undefined,
              requestIds.length
                ? inArray(inventoryReceipts.purchaseRequestId, requestIds)
                : undefined,
              orderIds.length
                ? inArray(inventoryReceipts.purchaseOrderId, orderIds)
                : undefined,
            ),
          ),
        receiptIds.length || orderIds.length
          ? this.db
              .select({
                receiptId: inventoryReceiptItems.receiptId,
                orderId: purchaseOrderItems.purchaseOrderId,
              })
              .from(inventoryReceiptItems)
              .innerJoin(
                purchaseOrderItems,
                eq(
                  purchaseOrderItems.id,
                  inventoryReceiptItems.purchaseOrderItemId,
                ),
              )
              .where(
                or(
                  receiptIds.length
                    ? inArray(inventoryReceiptItems.receiptId, receiptIds)
                    : undefined,
                  orderIds.length
                    ? inArray(purchaseOrderItems.purchaseOrderId, orderIds)
                    : undefined,
                ),
              )
          : Promise.resolve([] as { receiptId: string; orderId: string }[]),
      ]);

    return {
      receiptIds: [
        ...new Set([
          ...receiptsLinkedDirectly.map((row) => row.receiptId),
          ...receiptsLinkedViaReceivedItems.map((row) => row.receiptId),
        ]),
      ],
      requestIds: [
        ...new Set(
          receiptsLinkedDirectly
            .map((row) => row.requestId)
            .filter((id): id is string => id !== null),
        ),
      ],
      orderIds: [
        ...new Set([
          ...receiptsLinkedDirectly
            .map((row) => row.orderId)
            .filter((id): id is string => id !== null),
          ...receiptsLinkedViaReceivedItems.map((row) => row.orderId),
        ]),
      ],
    };
  }

  private async selectNotesByIds(
    ids: ChainIds,
  ): Promise<PurchaseChainNotesResDto> {
    const [
      purchaseRequestNotes,
      quotationNotes,
      purchaseOrderNotes,
      inventoryReceiptNotes,
    ] = await Promise.all([
      ids.requestIds.length
        ? this.db
            .select({
              id: purchaseRequests.id,
              code: purchaseRequests.code,
              note: purchaseRequests.note,
            })
            .from(purchaseRequests)
            .where(inArray(purchaseRequests.id, ids.requestIds))
        : [],
      ids.quotationIds.length
        ? this.db
            .select({
              id: purchaseQuotations.id,
              code: purchaseQuotations.code,
              note: purchaseQuotations.note,
            })
            .from(purchaseQuotations)
            .where(inArray(purchaseQuotations.id, ids.quotationIds))
        : [],
      ids.orderIds.length
        ? this.db
            .select({
              id: purchaseOrders.id,
              code: purchaseOrders.code,
              note: purchaseOrders.note,
            })
            .from(purchaseOrders)
            .where(inArray(purchaseOrders.id, ids.orderIds))
        : [],
      ids.receiptIds.length
        ? this.db
            .select({
              id: inventoryReceipts.id,
              code: inventoryReceipts.code,
              note: inventoryReceipts.note,
            })
            .from(inventoryReceipts)
            .where(inArray(inventoryReceipts.id, ids.receiptIds))
        : [],
    ]);

    return plainToInstance(
      PurchaseChainNotesResDto,
      {
        purchaseRequests: purchaseRequestNotes,
        quotations: quotationNotes,
        purchaseOrders: purchaseOrderNotes,
        inventoryReceipts: inventoryReceiptNotes,
      },
      { excludeExtraneousValues: true },
    );
  }
}
