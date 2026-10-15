import { and, asc, eq, sql } from 'drizzle-orm';

import type { Database, DbTransaction } from '../../database/database.type';
import {
  ncrs,
  NcrOriginType,
  type NcrSelect,
  QualityInspectionType,
  qualityInspections,
} from '../../database/schemas';

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

const ncrRefColumns = { id: ncrs.id, code: ncrs.code, status: ncrs.status };

/** Tham chiếu một NCR theo id (`null` nếu không tồn tại). */
export async function getNcrRefById(
  db: Database | DbTransaction,
  ncrId: string,
) {
  const [ncrRef] = await db
    .select(ncrRefColumns)
    .from(ncrs)
    .where(eq(ncrs.id, ncrId))
    .limit(1);

  return ncrRef ?? null;
}

/** NCR sinh ra từ một phiếu OQC sàng lọc (`ncrs.quality_inspection_id`), sắp theo ngày tạo — để OQC truy ngược
 * sang NCR. */
export async function getNcrRefsByQualityInspectionId(
  db: Database | DbTransaction,
  qualityInspectionId: string,
) {
  return db
    .select(ncrRefColumns)
    .from(ncrs)
    .where(eq(ncrs.qualityInspectionId, qualityInspectionId))
    .orderBy(asc(ncrs.createdAt));
}

/** Đầu mối truy vết của một NCR: OQC nguồn, NCR cha, NCR con và các phiếu OQC lại đã yêu cầu. */
export async function getNcrTrace(
  db: Database | DbTransaction,
  ncr: Pick<NcrSelect, 'id' | 'qualityInspectionId' | 'parentNcrId'>,
) {
  const oqcRefColumns = {
    id: qualityInspections.id,
    code: qualityInspections.inspectionNo,
    status: qualityInspections.status,
    result: qualityInspections.decision,
    quantity: qualityInspections.quantity,
  };

  const [[sourceInspection], parentNcr, childNcrs, reinspections] =
    await Promise.all([
      ncr.qualityInspectionId
        ? db
            .select(oqcRefColumns)
            .from(qualityInspections)
            .where(eq(qualityInspections.id, ncr.qualityInspectionId))
            .limit(1)
        : Promise.resolve([]),
      ncr.parentNcrId ? getNcrRefById(db, ncr.parentNcrId) : null,
      db
        .select(ncrRefColumns)
        .from(ncrs)
        .where(eq(ncrs.parentNcrId, ncr.id))
        .orderBy(asc(ncrs.createdAt)),
      db
        .select(oqcRefColumns)
        .from(qualityInspections)
        .where(
          and(
            eq(qualityInspections.ncrId, ncr.id),
            eq(qualityInspections.inspectionType, QualityInspectionType.OQC),
          ),
        )
        .orderBy(asc(qualityInspections.createdAt)),
    ]);

  return {
    qualityInspection: sourceInspection ?? null,
    parentNcr,
    childNcrs,
    reinspections,
  };
}
