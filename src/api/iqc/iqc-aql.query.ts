import { and, asc, desc, eq, gte, isNull, lte, or } from 'drizzle-orm';

import type { Database, DbTransaction } from '../../database/database.type';
import {
  IqcInspectionLevel,
  qcAqlPlans,
  qcAqlRules,
} from '../../database/schemas';
import type { AqlPlan } from './iqc-aql.constant';

/** Tra `qc_aql_plans`/`qc_aql_rules` theo `(lot size, inspection level, AQL)` — thay hardcode
 * `LOT_SIZE_CODE_LETTER`/`SAMPLING_PLAN` cũ (`docs/decisions/qc-aql-master-data.md`). Chỉ plan
 * `isActive` mới tra được; rule khớp khi `lotSize` nằm trong `[lotSizeMin, lotSizeMax]`
 * (`lotSizeMax = NULL` = vô cực). Không khớp rule nào → `undefined`, giữ nguyên hành vi "tra hụt"
 * của bảng hardcode cũ. */
export async function resolveAqlPlan(
  db: Database | DbTransaction,
  lotSize: number,
  level: IqcInspectionLevel,
  aql: number,
): Promise<AqlPlan | undefined> {
  const [row] = await db
    .select({
      planId: qcAqlPlans.id,
      ruleId: qcAqlRules.id,
      codeLetter: qcAqlRules.codeLetter,
      sampleSize: qcAqlRules.sampleSize,
      ac: qcAqlRules.acceptanceNumber,
      re: qcAqlRules.rejectionNumber,
    })
    .from(qcAqlRules)
    .innerJoin(qcAqlPlans, eq(qcAqlPlans.id, qcAqlRules.aqlPlanId))
    .where(
      and(
        eq(qcAqlPlans.inspectionLevel, level),
        eq(qcAqlPlans.aqlLevel, aql),
        eq(qcAqlPlans.isActive, true),
        lte(qcAqlRules.lotSizeMin, lotSize),
        or(isNull(qcAqlRules.lotSizeMax), gte(qcAqlRules.lotSizeMax, lotSize)),
      ),
    )
    // Tất định nếu 2 rule lỡ chồng dải (lỗ hổng đã biết, service là chốt chặn duy nhất —
    // `QcAqlService.validateNoOverlap`) — không để `.limit(1)` chọn ngẫu nhiên dòng nào bị đóng
    // băng vào `qc_inspections`.
    .orderBy(desc(qcAqlRules.lotSizeMin), asc(qcAqlRules.id))
    .limit(1);

  return row;
}
