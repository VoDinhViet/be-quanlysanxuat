import { Expose } from 'class-transformer';

import {
  clampLimit,
  formatListResult,
  formatToolResult,
  formatVietnamDate,
  MAX_LIST_ROWS,
  serializeToolRows,
} from './ai-tool.result';

describe('clampLimit', () => {
  it('defaults, and keeps the value within 1..MAX_LIST_ROWS', () => {
    expect(clampLimit(undefined)).toBe(10);
    expect(clampLimit(0)).toBe(1);
    expect(clampLimit(500)).toBe(MAX_LIST_ROWS);
  });
});

describe('formatListResult', () => {
  const rowOf = (index: number) => ({ code: `JOB-${index}` });

  it('caps the rows and reports total versus showing', () => {
    const rows = Array.from({ length: 30 }, (_, index) => rowOf(index));

    const result = JSON.parse(formatListResult({ rows, total: 80 })) as {
      total: number;
      showing: number;
      rows: unknown[];
    };

    expect(result.total).toBe(80);
    expect(result.showing).toBe(MAX_LIST_ROWS);
    expect(result.rows).toHaveLength(MAX_LIST_ROWS);
  });

  it('drops rows until the serialized result fits the character cap', () => {
    const rows = Array.from({ length: 20 }, () => ({ note: 'x'.repeat(1000) }));

    const raw = formatListResult({ rows, total: 20 });
    const result = JSON.parse(raw) as { showing: number };

    expect(raw.length).toBeLessThanOrEqual(6000);
    expect(result.showing).toBeLessThan(20);
  });
});

describe('formatVietnamDate', () => {
  it('formats a date-only value as dd/MM/yyyy and tolerates null', () => {
    expect(formatVietnamDate(new Date('2026-09-30T00:00:00.000Z'))).toBe(
      '30/09/2026',
    );
    expect(formatVietnamDate(null)).toBeNull();
  });
});

describe('formatToolResult', () => {
  it('writes every Date, at any depth, as dd/MM/yyyy', () => {
    const result = JSON.parse(
      formatToolResult({
        dueDate: new Date('2026-09-30T00:00:00.000Z'),
        rows: [{ createdAt: new Date('2026-09-30T20:00:00.000Z') }],
      }),
    ) as { dueDate: string; rows: { createdAt: string }[] };

    expect(result.dueDate).toBe('30/09/2026');
    // 20:00 UTC is already the next day in Vietnam (UTC+7).
    expect(result.rows[0].createdAt).toBe('01/10/2026');
  });
});

describe('serializeToolRows', () => {
  class ExposedDto {
    @Expose()
    code!: string;
  }

  it('keeps only the exposed fields', () => {
    const [row] = serializeToolRows(ExposedDto, [
      { code: 'JOB-1', taxCode: '0123', email: 'a@b.c' },
    ]);

    expect(JSON.parse(JSON.stringify(row))).toEqual({ code: 'JOB-1' });
  });
});
