import { RiskDefinition, RiskLevel } from './risk.type';

export const RISK_LEVEL_LABELS: Record<RiskLevel, string> = {
  [RiskLevel.HIGH]: 'CAO',
  [RiskLevel.MEDIUM]: 'TRUNG BÌNH',
  [RiskLevel.LOW]: 'THẤP',
};

/** One entry per risk signal. Thresholds are the counts at which a signal turns MEDIUM and HIGH;
 * adjust them here, nowhere else. */
export const RISK_DEFINITIONS: readonly RiskDefinition[] = [
  {
    signal: 'overdueJobs',
    label: 'Job trễ hạn',
    thresholds: { medium: 1, high: 5 },
  },
  {
    signal: 'overdueOrders',
    label: 'Đơn bán hàng trễ hạn',
    thresholds: { medium: 1, high: 3 },
  },
  {
    signal: 'dueSoonOrders',
    label: 'Đơn bán hàng sắp đến hạn',
    thresholds: { medium: 1, high: 5 },
  },
  {
    signal: 'openNcrs',
    label: 'NCR đang mở',
    thresholds: { medium: 1, high: 3 },
  },
  {
    signal: 'lateOutsourcingOrders',
    label: 'Đơn gia công trễ hạn',
    thresholds: { medium: 1, high: 3 },
  },
  {
    signal: 'upcomingDeliveries',
    label: 'Giao hàng trong 3 ngày tới',
    thresholds: { medium: 1, high: 5 },
  },
  {
    signal: 'materialShortages',
    label: 'Vật tư đã thiếu',
    thresholds: { medium: 1, high: 1 },
  },
  {
    signal: 'materialWarnings',
    label: 'Vật tư sắp thiếu',
    thresholds: { medium: 1, high: 10 },
  },
  {
    signal: 'overduePurchaseOrders',
    label: 'Đơn mua hàng trễ ngày giao',
    thresholds: { medium: 1, high: 3 },
  },
];
