export enum RiskLevel {
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
}

/** How many records trip a signal, plus a few document codes as concrete examples. */
export type RiskSignal = {
  count: number;
  examples: string[];
};

/** A signal is `undefined` when its data source was not collected (no permission, or unavailable). */
export type RiskSignals = {
  overdueJobs?: RiskSignal;
  overdueOrders?: RiskSignal;
  dueSoonOrders?: RiskSignal;
  openNcrs?: RiskSignal;
  lateOutsourcingOrders?: RiskSignal;
  upcomingDeliveries?: RiskSignal;
  materialShortages?: RiskSignal;
  materialWarnings?: RiskSignal;
  overduePurchaseOrders?: RiskSignal;
};

export type RiskThresholds = {
  /** Smallest count that makes the risk MEDIUM. */
  medium: number;
  /** Smallest count that makes the risk HIGH. */
  high: number;
};

export type RiskDefinition = {
  signal: keyof RiskSignals;
  label: string;
  thresholds: RiskThresholds;
};

export type Risk = {
  signal: keyof RiskSignals;
  label: string;
  level: RiskLevel;
  count: number;
  examples: string[];
};

export type RiskAssessment = {
  overallLevel: RiskLevel;
  risks: Risk[];
};
