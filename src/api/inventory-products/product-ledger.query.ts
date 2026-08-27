import { and, Column, eq, getTableColumns, gte, lt, sql } from 'drizzle-orm';

import type { Database } from '../../database/database.type';
import { inventoryTransactions } from '../../database/schemas';

/** Sổ cái của một item, tồn luỹ kế (`balanceAfter`) tính bằng window function trên TOÀN BỘ lịch sử
 * — không lọc theo khoảng ngày ở đây, nếu không số luỹ kế của các dòng còn lại sẽ sai. Nơi gọi lọc
 * ngày + phân trang ở query ngoài, sau khi đã có `balanceAfter` đúng (`docs/domains/inventory.md`).
 */
export function productLedgerSubquery(
  db: Database,
  itemId: string,
  warehouseId?: string,
) {
  return db
    .select({
      ...getTableColumns(inventoryTransactions),
      balanceAfter: sql<number>`sum(${inventoryTransactions.quantity}) over (
        order by ${inventoryTransactions.transactionDate},
                 ${inventoryTransactions.createdAt},
                 ${inventoryTransactions.id}
      )`
        .mapWith(Number)
        .as('balance_after'),
    })
    .from(inventoryTransactions)
    .where(
      and(
        eq(inventoryTransactions.itemId, itemId),
        warehouseId
          ? eq(inventoryTransactions.warehouseId, warehouseId)
          : undefined,
      ),
    )
    .as('ledger');
}

/** Dùng chung cho cả query lấy dòng lẫn `count()` — nhận `transactionDate` của bảng gọi (`ledger`
 * hoặc `inventory_transactions` thẳng) để không lặp lại điều kiện ngày ở hai nơi. */
export function productLedgerDateRangeCondition(
  transactionDate: Column,
  startDate?: Date,
  endDate?: Date,
) {
  return and(
    startDate ? gte(transactionDate, startDate) : undefined,
    // Biên phải mở — `endDate` parse ra nửa đêm UTC, `lte` sẽ bỏ sót giao dịch cùng ngày.
    endDate
      ? lt(transactionDate, new Date(endDate.getTime() + 24 * 60 * 60 * 1000))
      : undefined,
  );
}
