import {
  evaluateRisks,
  resolveOverallRiskLevel,
  resolveRiskLevel,
} from './risk-evaluator';
import { Risk, RiskLevel } from './risk.type';

describe('resolveRiskLevel', () => {
  const thresholds = { medium: 1, high: 5 };

  it.each([
    [0, null],
    [1, RiskLevel.MEDIUM],
    [4, RiskLevel.MEDIUM],
    [5, RiskLevel.HIGH],
    [12, RiskLevel.HIGH],
  ])('count %i -> %s', (count, expected) => {
    expect(resolveRiskLevel(count, thresholds)).toBe(expected);
  });
});

describe('evaluateRisks', () => {
  it('reports LOW with no risks when every signal is quiet', () => {
    const assessment = evaluateRisks({
      overdueJobs: { count: 0, examples: [] },
      openNcrs: { count: 0, examples: [] },
    });

    expect(assessment).toEqual({ overallLevel: RiskLevel.LOW, risks: [] });
  });

  it('ignores signals that were not collected', () => {
    expect(evaluateRisks({}).risks).toEqual([]);
  });

  it('takes the highest level as overall and lists the worst risks first', () => {
    const assessment = evaluateRisks({
      openNcrs: { count: 1, examples: ['NCR-1'] },
      overdueJobs: { count: 6, examples: ['JOB-1', 'JOB-2'] },
    });

    expect(assessment.overallLevel).toBe(RiskLevel.HIGH);
    expect(assessment.risks.map((risk) => [risk.signal, risk.level])).toEqual([
      ['overdueJobs', RiskLevel.HIGH],
      ['openNcrs', RiskLevel.MEDIUM],
    ]);
    expect(assessment.risks[0].examples).toEqual(['JOB-1', 'JOB-2']);
  });

  it('treats any material shortage as HIGH', () => {
    const { risks } = evaluateRisks({
      materialShortages: { count: 1, examples: ['VT-1'] },
    });

    expect(risks[0].level).toBe(RiskLevel.HIGH);
  });
});

describe('resolveOverallRiskLevel', () => {
  const riskOf = (level: RiskLevel): Risk => ({
    signal: 'overdueJobs',
    label: 'x',
    level,
    count: 1,
    examples: [],
  });

  it('is MEDIUM when the worst risk is MEDIUM', () => {
    expect(resolveOverallRiskLevel([riskOf(RiskLevel.MEDIUM)])).toBe(
      RiskLevel.MEDIUM,
    );
  });
});
