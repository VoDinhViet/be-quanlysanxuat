import { RISK_DEFINITIONS } from './risk.constant';
import {
  Risk,
  RiskAssessment,
  RiskDefinition,
  RiskLevel,
  RiskSignal,
  RiskSignals,
  RiskThresholds,
} from './risk.type';

export function resolveRiskLevel(
  count: number,
  thresholds: RiskThresholds,
): RiskLevel | null {
  if (count >= thresholds.high) {
    return RiskLevel.HIGH;
  }
  if (count >= thresholds.medium) {
    return RiskLevel.MEDIUM;
  }
  return null;
}

/** Turns one signal into a risk, or `null` when it is missing or below its MEDIUM threshold. */
export function evaluateRisk(
  definition: RiskDefinition,
  signal: RiskSignal | undefined,
): Risk | null {
  if (!signal) {
    return null;
  }
  const level = resolveRiskLevel(signal.count, definition.thresholds);
  if (!level) {
    return null;
  }
  return {
    signal: definition.signal,
    label: definition.label,
    level,
    count: signal.count,
    examples: signal.examples,
  };
}

export function resolveOverallRiskLevel(risks: readonly Risk[]): RiskLevel {
  if (risks.some((risk) => risk.level === RiskLevel.HIGH)) {
    return RiskLevel.HIGH;
  }
  if (risks.some((risk) => risk.level === RiskLevel.MEDIUM)) {
    return RiskLevel.MEDIUM;
  }
  return RiskLevel.LOW;
}

const RISK_LEVEL_ORDER = [RiskLevel.HIGH, RiskLevel.MEDIUM, RiskLevel.LOW];

export function evaluateRisks(signals: RiskSignals): RiskAssessment {
  const risks = RISK_DEFINITIONS.map((definition) =>
    evaluateRisk(definition, signals[definition.signal]),
  )
    .filter((risk): risk is Risk => risk !== null)
    .sort(
      (a, b) =>
        RISK_LEVEL_ORDER.indexOf(a.level) - RISK_LEVEL_ORDER.indexOf(b.level),
    );

  return { overallLevel: resolveOverallRiskLevel(risks), risks };
}
