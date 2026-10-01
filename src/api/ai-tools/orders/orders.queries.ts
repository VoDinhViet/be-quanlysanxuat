import { OrderStatus } from '../../../database/schemas';
import { GetOrdersReqDto } from '../../orders/dto/get-orders.req.dto';
import type { PageOrderResDto } from '../../orders/dto/page-order.res.dto';
import { OrdersService } from '../../orders/orders.service';
import {
  clampLimit,
  createRequestDto,
  getVietnamDate,
} from '../core/ai-tool.result';
import type { OrderScope } from './orders.schemas';

const RUNNING_ORDER_STATUSES = [
  OrderStatus.AWAITING_PRODUCTION,
  OrderStatus.IN_PROGRESS,
];
const DUE_SOON_WINDOW_DAYS = 7;

/** Due-date range (inclusive, `dueDate` column) that each scope maps to. */
function getDueDateRange(scope: OrderScope) {
  switch (scope) {
    case 'overdue':
      return { endDate: getVietnamDate(-1) };
    case 'due_soon':
      return {
        startDate: getVietnamDate(0),
        endDate: getVietnamDate(DUE_SOON_WINDOW_DAYS),
      };
    case 'running':
      return {};
  }
}

export type RunningOrders = {
  orders: PageOrderResDto[];
  total: number;
};

/** Orders still being worked on within `scope`, soonest due date first. `getOrders` filters one
 * status at a time, so the two running statuses are fetched separately and merged. */
export async function findRunningOrders(
  ordersService: OrdersService,
  scope: OrderScope,
  limit: number | undefined,
): Promise<RunningOrders> {
  const pages = await Promise.all(
    RUNNING_ORDER_STATUSES.map((status) =>
      ordersService.getOrders(
        createRequestDto(GetOrdersReqDto, {
          limit: clampLimit(limit),
          status,
          ...getDueDateRange(scope),
        }),
      ),
    ),
  );

  return {
    orders: pages
      .flatMap((page) => page.data)
      .sort(
        (a, b) => (a.dueDate?.getTime() ?? 0) - (b.dueDate?.getTime() ?? 0),
      ),
    total: pages.reduce((sum, page) => sum + page.pagination.totalRecords, 0),
  };
}
