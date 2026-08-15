import { and, eq, sql } from 'drizzle-orm';

import type { Database, DbTransaction } from '../../database/database.type';
import { oqcInspections, OqcStatus } from '../../database/schemas';

/** Σ `quantity` mọi OQC `COMPLETED` (PASS) của một Job — dùng bởi
 * `InventoryReceiptsService.confirmInventoryReceipt` để chặn (`E180`) nhận vượt SL đã PASS OQC,
 * xem `docs/workflows/final-qc.md`. Plain function, không qua DI — cùng khuôn
 * `getReceivedQuantityByOutsourcingOrderId`. */
export async function getPassedOqcQuantityByJobId(
  db: Database | DbTransaction,
  productionJobId: string,
): Promise<number> {
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(${oqcInspections.quantity}), 0)`.mapWith(
        Number,
      ),
    })
    .from(oqcInspections)
    .where(
      and(
        eq(oqcInspections.productionJobId, productionJobId),
        eq(oqcInspections.status, OqcStatus.COMPLETED),
      ),
    );

  return row?.total ?? 0;
}
