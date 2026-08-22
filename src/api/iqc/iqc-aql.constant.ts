import { IqcResult } from '../../database/schemas';

export const AQL_LEVELS = [0.65, 1.0, 1.5, 2.5, 4.0, 6.5] as const;

export type AqlPlan = {
  planId: string;
  ruleId: string;
  codeLetter: string;
  sampleSize: number;
  ac: number;
  re: number;
};

/** Số lỗi đếm được (`defectQty`) so `ac` của chính plan đó — `defectQty ≤ ac` thì PASS, ngược lại
 * FAIL. Dùng để tự suy `resultAuto` lúc `confirmOqc` (`OqcService`) — thuần gợi ý, QC toàn quyền
 * ghi đè `result`, không cần lý do. */
export function resolveAqlResult(plan: AqlPlan, defectQty: number): IqcResult {
  return defectQty <= plan.ac ? IqcResult.PASS : IqcResult.FAIL;
}
