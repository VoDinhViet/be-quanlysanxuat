import { and, eq, sql } from 'drizzle-orm';

import type { Database, DbTransaction } from '../../database/database.type';
import { ncrs, NcrOriginType } from '../../database/schemas';

/** Σ `ngQty` mọi NCR sinh từ OQC sàng lọc của Job — phần NG đã chuyển sang NCR xử lý nên không còn
 * "chờ nhập kho" ở Job gốc (`closeJobIfFullyReceived`). NCR tạo tay không tính: nó không lấy từ SL
 * của Job. */
export async function getNcrTransferredQtyByJobId(
  db: Database | DbTransaction,
  productionJobId: string,
): Promise<number> {
  const [transferred] = await db
    .select({
      total: sql<number>`coalesce(sum(${ncrs.ngQty}), 0)`.mapWith(Number),
    })
    .from(ncrs)
    .where(
      and(
        eq(ncrs.productionJobId, productionJobId),
        eq(ncrs.originType, NcrOriginType.OQC),
      ),
    );

  return transferred?.total ?? 0;
}
