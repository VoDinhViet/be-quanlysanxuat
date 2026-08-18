import {
  and,
  eq,
  inArray,
  ne,
  or,
  isNull as sqlIsNull,
  sql,
} from 'drizzle-orm';

import type { Database, DbTransaction } from '../../database/database.type';
import {
  OqcDisposition,
  oqcInspections,
  OqcStatus,
  productionJobOperations,
} from '../../database/schemas';

/** Dòng `disposition = SCRAP` không tính vào SL đã xin QC của một công đoạn — hàng đã loại bỏ hẳn,
 * giải phóng lại quota lô để xưởng làm bù (`docs/domains/quality.md`). `disposition` chỉ khác
 * `null` khi `result = FAIL` (`chk_oqc_inspections_disposition_requires_fail`), nên chỉ cần lọc
 * trên `disposition` — không cần đụng tới `result`. */
const notScrapped = or(
  sqlIsNull(oqcInspections.disposition),
  ne(oqcInspections.disposition, OqcDisposition.SCRAP),
);

/** Σ `quantity` mọi OQC (trừ `disposition = SCRAP`) theo từng công đoạn — dùng để validate
 * `E176`/`E198` khi tạo OQC mới (`OqcService.createOqc`). */
export async function getInspectedQuantityByOperationIds(
  db: Database | DbTransaction,
  productionJobOperationIds: string[],
): Promise<Map<string, number>> {
  if (!productionJobOperationIds.length) {
    return new Map();
  }

  const rows = await db
    .select({
      productionJobOperationId: oqcInspections.productionJobOperationId,
      total: sql<number>`coalesce(sum(${oqcInspections.quantity}), 0)`.mapWith(
        Number,
      ),
    })
    .from(oqcInspections)
    .where(
      and(
        inArray(
          oqcInspections.productionJobOperationId,
          productionJobOperationIds,
        ),
        notScrapped,
      ),
    )
    .groupBy(oqcInspections.productionJobOperationId);

  const total = new Map<string, number>();
  for (const row of rows) {
    if (row.productionJobOperationId !== null) {
      total.set(row.productionJobOperationId, row.total);
    }
  }

  return total;
}

/** Σ `quantity` mọi OQC (trừ `disposition = SCRAP`) của MỌI công đoạn thuộc cùng một node BOM (join
 * qua `productionJobOperationId`) — dùng để validate `E176`: 1 node có thể có nhiều công đoạn (as-
 * used), nhưng cùng là 1 part vật lý, nên trần SL kế hoạch phải tính gộp qua node, không phải riêng
 * từng công đoạn (đó là việc của `E198`). */
export async function getInspectedQuantityByBomItemId(
  db: Database | DbTransaction,
  productionJobBomItemId: string,
): Promise<number> {
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(${oqcInspections.quantity}), 0)`.mapWith(
        Number,
      ),
    })
    .from(oqcInspections)
    .innerJoin(
      productionJobOperations,
      eq(productionJobOperations.id, oqcInspections.productionJobOperationId),
    )
    .where(
      and(
        eq(
          productionJobOperations.productionJobBomItemId,
          productionJobBomItemId,
        ),
        notScrapped,
      ),
    );

  return row?.total ?? 0;
}

/** Bản subquery-table của `getInspectedQuantityByOperationIds` — LEFT JOIN thẳng vào SELECT hiển
 * thị (`OqcService.getInspectableOperations`) thay vì round-trip `Map` riêng, cùng khuôn
 * `sentQuantityByJobOperationSubquery` bên `outsourcing-orders.query.ts`. */
export function inspectedQuantityByJobOperationSubquery(db: Database) {
  return db
    .select({
      productionJobOperationId: oqcInspections.productionJobOperationId,
      inspectedQuantity:
        sql<number>`coalesce(sum(${oqcInspections.quantity}), 0)`
          .mapWith(Number)
          .as('inspected_quantity'),
    })
    .from(oqcInspections)
    .where(notScrapped)
    .groupBy(oqcInspections.productionJobOperationId)
    .as('inspected_quantity_by_job_operation');
}

/** Điều kiện "Job đã QC xong hết" dùng cho gate nhập kho TP (`E196`, Phase 4) và gate giao hàng
 * (`E205`, Phase 6): Job phải có ít nhất 1 phiếu OQC, và không còn phiếu nào ở
 * `NOT_INSPECTED`/`PENDING`/`REWORK`. */
export async function getJobOqcClearance(
  db: Database | DbTransaction,
  productionJobId: string,
): Promise<{ total: number; open: number }> {
  const [row] = await db
    .select({
      total: sql<number>`count(*)`.mapWith(Number),
      open: sql<number>`count(*) filter (where ${oqcInspections.status} != ${OqcStatus.COMPLETED})`.mapWith(
        Number,
      ),
    })
    .from(oqcInspections)
    .where(eq(oqcInspections.productionJobId, productionJobId));

  return { total: row?.total ?? 0, open: row?.open ?? 0 };
}

/** Tóm tắt OQC theo từng công đoạn — hiển thị ở `GET /production-jobs/:jobId/bom`
 * (`ProductionJobsService.getProductionJobBom`), đọc một chiều, không ghi ngược gì vào
 * `production_job_operations` (`docs/domains/production.md`). */
export async function getOqcSummaryByJobOperationIds(
  db: Database | DbTransaction,
  productionJobOperationIds: string[],
): Promise<Map<string, { inspectedQuantity: number; openCount: number }>> {
  if (!productionJobOperationIds.length) {
    return new Map();
  }

  const rows = await db
    .select({
      productionJobOperationId: oqcInspections.productionJobOperationId,
      inspectedQuantity: sql<number>`coalesce(sum(${oqcInspections.quantity})
        filter (where ${notScrapped}), 0)`.mapWith(Number),
      openCount:
        sql<number>`count(*) filter (where ${oqcInspections.status} != ${OqcStatus.COMPLETED})`.mapWith(
          Number,
        ),
    })
    .from(oqcInspections)
    .where(
      inArray(
        oqcInspections.productionJobOperationId,
        productionJobOperationIds,
      ),
    )
    .groupBy(oqcInspections.productionJobOperationId);

  const summary = new Map<
    string,
    { inspectedQuantity: number; openCount: number }
  >();
  for (const row of rows) {
    if (row.productionJobOperationId !== null) {
      summary.set(row.productionJobOperationId, {
        inspectedQuantity: row.inspectedQuantity,
        openCount: row.openCount,
      });
    }
  }

  return summary;
}
