import * as dotenv from 'dotenv';
dotenv.config({ path: `.env.${process.env.NODE_ENV || 'development'}` });
dotenv.config();

import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from '../schemas';
import { IqcInspectionLevel } from '../schemas';
import { qcAqlPlans } from '../schemas/quality/qc-aql-plans';
import { qcAqlRules } from '../schemas/quality/qc-aql-rules';

const STANDARD = 'ANSI/ASQ Z1.4';
const AQL_LEVELS = [0.65, 1.0, 1.5, 2.5, 4.0, 6.5] as const;

type LotSizeRange = { max: number } & Record<IqcInspectionLevel, string>;

// Snapshot lịch sử của bảng I (ANSI/ASQ Z1.4) — nguồn seed một lần cho `qc_aql_plans`/
// `qc_aql_rules`. Sau khi seed, DB là nguồn thật; hai hằng số này KHÔNG còn ở
// `src/api/iqc/iqc-aql.constant.ts` nữa (`docs/decisions/qc-aql-master-data.md`).
const LOT_SIZE_CODE_LETTER: LotSizeRange[] = [
  { max: 8, I: 'A', II: 'A', III: 'B' },
  { max: 15, I: 'A', II: 'B', III: 'C' },
  { max: 25, I: 'B', II: 'C', III: 'D' },
  { max: 50, I: 'C', II: 'D', III: 'E' },
  { max: 90, I: 'C', II: 'E', III: 'F' },
  { max: 150, I: 'D', II: 'F', III: 'G' },
  { max: 280, I: 'E', II: 'G', III: 'H' },
  { max: 500, I: 'F', II: 'H', III: 'J' },
  { max: 1200, I: 'G', II: 'J', III: 'K' },
  { max: 3200, I: 'H', II: 'K', III: 'L' },
  { max: 10000, I: 'J', II: 'L', III: 'M' },
  { max: 35000, I: 'K', II: 'M', III: 'N' },
  { max: 150000, I: 'L', II: 'N', III: 'P' },
  { max: 500000, I: 'M', II: 'P', III: 'Q' },
  { max: Infinity, I: 'N', II: 'Q', III: 'R' },
];

type SamplingPlan = { n: number; acRe: Record<number, [number, number]> };

// Bảng II-A (kiểm tra thường, lấy mẫu đơn) — ô nào bảng gốc dùng mũi tên (arrow) thì để trống, giữ
// nguyên hành vi "tra hụt, QC nhập tay" của bản hardcode cũ.
const SAMPLING_PLAN: Record<string, SamplingPlan> = {
  A: {
    n: 2,
    acRe: {
      0.65: [0, 1],
      1.0: [0, 1],
      1.5: [0, 1],
      2.5: [0, 1],
      4.0: [0, 1],
      6.5: [0, 1],
    },
  },
  B: {
    n: 3,
    acRe: {
      0.65: [0, 1],
      1.0: [0, 1],
      1.5: [0, 1],
      2.5: [0, 1],
      4.0: [0, 1],
      6.5: [1, 2],
    },
  },
  C: {
    n: 5,
    acRe: {
      0.65: [0, 1],
      1.0: [0, 1],
      1.5: [0, 1],
      2.5: [0, 1],
      4.0: [1, 2],
      6.5: [2, 3],
    },
  },
  D: {
    n: 8,
    acRe: {
      0.65: [0, 1],
      1.0: [0, 1],
      1.5: [0, 1],
      2.5: [1, 2],
      4.0: [2, 3],
      6.5: [3, 4],
    },
  },
  E: {
    n: 13,
    acRe: {
      0.65: [0, 1],
      1.0: [0, 1],
      1.5: [1, 2],
      2.5: [2, 3],
      4.0: [3, 4],
      6.5: [5, 6],
    },
  },
  F: {
    n: 20,
    acRe: {
      0.65: [0, 1],
      1.0: [1, 2],
      1.5: [2, 3],
      2.5: [3, 4],
      4.0: [5, 6],
      6.5: [7, 8],
    },
  },
  G: {
    n: 32,
    acRe: {
      0.65: [1, 2],
      1.0: [2, 3],
      1.5: [3, 4],
      2.5: [5, 6],
      4.0: [7, 8],
      6.5: [10, 11],
    },
  },
  H: {
    n: 50,
    acRe: {
      0.65: [2, 3],
      1.0: [3, 4],
      1.5: [5, 6],
      2.5: [7, 8],
      4.0: [10, 11],
      6.5: [14, 15],
    },
  },
  J: {
    n: 80,
    acRe: {
      0.65: [3, 4],
      1.0: [5, 6],
      1.5: [7, 8],
      2.5: [10, 11],
      4.0: [14, 15],
      6.5: [21, 22],
    },
  },
  K: {
    n: 125,
    acRe: {
      0.65: [5, 6],
      1.0: [7, 8],
      1.5: [10, 11],
      2.5: [14, 15],
      4.0: [21, 22],
      6.5: [30, 31],
    },
  },
  L: {
    n: 200,
    acRe: {
      0.65: [7, 8],
      1.0: [10, 11],
      1.5: [14, 15],
      2.5: [21, 22],
      4.0: [30, 31],
      6.5: [44, 45],
    },
  },
  M: {
    n: 315,
    acRe: {
      0.65: [10, 11],
      1.0: [14, 15],
      1.5: [21, 22],
      2.5: [30, 31],
      4.0: [44, 45],
    },
  },
  N: {
    n: 500,
    acRe: { 0.65: [14, 15], 1.0: [21, 22], 1.5: [30, 31], 2.5: [44, 45] },
  },
  P: { n: 800, acRe: { 0.65: [21, 22], 1.0: [30, 31], 1.5: [44, 45] } },
  Q: { n: 1250, acRe: { 0.65: [30, 31], 1.0: [44, 45] } },
  R: { n: 2000, acRe: { 0.65: [44, 45] } },
};

type MergedRange = {
  codeLetter: string;
  lotSizeMin: number;
  lotSizeMax: number | null;
};

/**
 * Gộp các hàng liền kề cùng code letter của một inspection level thành 1 dải — bảng gốc lặp lại
 * cùng 1 letter ở nhiều hàng liên tiếp cho level I/II (vd level I: hàng max=8 và max=15 đều 'A').
 */
function buildMergedRanges(level: IqcInspectionLevel): MergedRange[] {
  const ranges: MergedRange[] = [];
  let prevMax = 0;

  for (const row of LOT_SIZE_CODE_LETTER) {
    const codeLetter = row[level];
    const lotSizeMin = prevMax + 1;
    const lotSizeMax = row.max === Infinity ? null : row.max;
    const last = ranges.at(-1);

    if (last && last.codeLetter === codeLetter) {
      last.lotSizeMax = lotSizeMax;
    } else {
      ranges.push({ codeLetter, lotSizeMin, lotSizeMax });
    }

    prevMax = row.max;
  }

  return ranges;
}

function planCode(level: IqcInspectionLevel, aql: number): string {
  return `Z14-${level}-${aql.toFixed(2)}`;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const client = postgres(databaseUrl, { max: 1 });
  const db = drizzle(client, { schema });

  try {
    await seedQcAql(db);
  } finally {
    await client.end();
  }
}

async function seedQcAql(db: ReturnType<typeof drizzle<typeof schema>>) {
  for (const level of Object.values(IqcInspectionLevel)) {
    const ranges = buildMergedRanges(level);

    for (const aql of AQL_LEVELS) {
      const code = planCode(level, aql);
      const existing = await db.query.qcAqlPlans.findFirst({
        where: eq(qcAqlPlans.code, code),
      });

      if (existing) {
        console.log(`AQL plan "${code}" already exists. Skipping.`);
        continue;
      }

      const rules = ranges
        .map((range) => {
          const acRe = SAMPLING_PLAN[range.codeLetter]?.acRe[aql];

          if (!acRe) {
            return null;
          }

          return {
            codeLetter: range.codeLetter,
            lotSizeMin: range.lotSizeMin,
            lotSizeMax: range.lotSizeMax,
            sampleSize: SAMPLING_PLAN[range.codeLetter].n,
            acceptanceNumber: acRe[0],
            rejectionNumber: acRe[1],
          };
        })
        .filter((rule) => rule !== null);

      await db.transaction(async (tx) => {
        const [plan] = await tx
          .insert(qcAqlPlans)
          .values({
            code,
            name: `${STANDARD} - Mức kiểm ${level} - AQL ${aql}`,
            standard: STANDARD,
            inspectionLevel: level,
            aqlLevel: aql,
          })
          .returning();

        if (rules.length > 0) {
          await tx
            .insert(qcAqlRules)
            .values(rules.map((rule) => ({ ...rule, aqlPlanId: plan.id })));
        }
      });

      console.log(`AQL plan "${code}" created with ${rules.length} rule(s).`);
    }
  }
}

if (require.main === module) {
  main()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('Failed to seed QC AQL plans:', error);
      process.exit(1);
    });
}
