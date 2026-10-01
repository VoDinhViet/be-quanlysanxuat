import { tool, type StructuredToolInterface } from '@langchain/core/tools';
import { Injectable } from '@nestjs/common';

import { GetPurchaseOrdersReqDto } from '../../purchase-orders/dto/get-purchase-orders.req.dto';
import { PurchaseOrdersService } from '../../purchase-orders/purchase-orders.service';
import { AiToolPermissionService } from '../core/ai-tool-permission.service';
import {
  clampLimit,
  createRequestDto,
  formatListResult,
  serializeToolRows,
} from '../core/ai-tool.result';
import type { AiToolProvider } from '../core/ai-tool.type';
import { PurchaseOrderSummaryResDto } from './dto/purchase-order-summary.res.dto';
import { findOverduePurchaseOrders } from './purchase-orders.queries';
import {
  listPurchaseOrdersSchema,
  type ListPurchaseOrdersInput,
} from './purchase-orders.schemas';

@Injectable()
export class PurchaseOrdersAiTools implements AiToolProvider {
  constructor(
    private readonly purchaseOrdersService: PurchaseOrdersService,
    private readonly toolPermission: AiToolPermissionService,
  ) {}

  getTools(): StructuredToolInterface[] {
    return [
      tool(
        this.toolPermission.withPermission(
          'purchasing:read',
          (input: ListPurchaseOrdersInput) => this.listPurchaseOrders(input),
        ),
        {
          name: 'list_purchase_orders',
          description:
            'Đơn mua hàng gửi nhà cung cấp còn hàng chưa nhập đủ. ' +
            'onlyOverdue=true: chỉ đơn đã quá ngày giao dự kiến mà vẫn chưa nhận đủ hàng.',
          schema: listPurchaseOrdersSchema,
        },
      ),
    ];
  }

  private async listPurchaseOrders({
    onlyOverdue,
    limit,
  }: ListPurchaseOrdersInput): Promise<string> {
    if (onlyOverdue) {
      const overdue = await findOverduePurchaseOrders(
        this.purchaseOrdersService,
      );
      return formatListResult({
        rows: serializeToolRows(PurchaseOrderSummaryResDto, overdue.orders),
        total: overdue.orders.length,
        extra: {
          openPurchaseOrders: overdue.openTotal,
          scanned: overdue.scanned,
        },
      });
    }

    const page = await this.purchaseOrdersService.getPurchaseOrders(
      createRequestDto(GetPurchaseOrdersReqDto, {
        limit: clampLimit(limit),
        hasRemainingReceipt: true,
      }),
    );
    return formatListResult({
      rows: serializeToolRows(PurchaseOrderSummaryResDto, page.data),
      total: page.pagination.totalRecords,
    });
  }
}
