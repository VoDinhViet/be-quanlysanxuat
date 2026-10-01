import { tool, type StructuredToolInterface } from '@langchain/core/tools';
import { Injectable } from '@nestjs/common';

import { OrdersService } from '../../orders/orders.service';
import { AiToolPermissionService } from '../core/ai-tool-permission.service';
import { formatListResult, serializeToolRows } from '../core/ai-tool.result';
import type { AiToolProvider } from '../core/ai-tool.type';
import { OrderSummaryResDto } from './dto/order-summary.res.dto';
import { findRunningOrders } from './orders.queries';
import { listOrdersSchema, type ListOrdersInput } from './orders.schemas';

@Injectable()
export class OrdersAiTools implements AiToolProvider {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly toolPermission: AiToolPermissionService,
  ) {}

  getTools(): StructuredToolInterface[] {
    return [
      tool(
        this.toolPermission.withPermission(
          'orders:read',
          (input: ListOrdersInput) => this.listOrders(input),
        ),
        {
          name: 'list_orders',
          description:
            'Danh sách đơn bán hàng đang thực hiện (chờ sản xuất hoặc đang thực hiện), sắp theo hạn giao. ' +
            'scope=overdue: đã trễ hạn; scope=due_soon: đến hạn trong 7 ngày tới; scope=running: tất cả đơn đang chạy.',
          schema: listOrdersSchema,
        },
      ),
    ];
  }

  private async listOrders({ scope, limit }: ListOrdersInput): Promise<string> {
    const { orders, total } = await findRunningOrders(
      this.ordersService,
      scope,
      limit,
    );
    return formatListResult({
      rows: serializeToolRows(OrderSummaryResDto, orders),
      total,
      extra: { scope },
    });
  }
}
