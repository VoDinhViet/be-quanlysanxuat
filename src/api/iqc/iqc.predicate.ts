import { and, eq, ne } from 'drizzle-orm';

import {
  qualityInspections,
  QualityInspectionDecision,
  QualityInspectionStatus,
} from '../../database/schemas';

/** Phiếu kiểm không đạt và chưa bị huỷ. */
export function isActiveFailedInspection() {
  return and(
    eq(qualityInspections.decision, QualityInspectionDecision.FAIL),
    ne(qualityInspections.status, QualityInspectionStatus.CANCELLED),
  );
}
