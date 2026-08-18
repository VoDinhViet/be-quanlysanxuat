import { IqcInspectionLevel, IqcResult } from '../../database/schemas';

export const AQL_LEVELS = [0.65, 1.0, 1.5, 2.5, 4.0, 6.5] as const;

type LotSizeRange = { max: number } & Record<IqcInspectionLevel, string>;

// Bảng I (ANSI/ASQ Z1.4, general inspection levels) — lot size × inspection level → code letter.
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

// Bảng II-A (kiểm tra thường, lấy mẫu đơn, ANSI/ASQ Z1.4 Table II-A) — code letter → sample size
// (n) + Ac/Re theo AQL. Chuỗi Ac/Re dùng đúng cấp số của bảng chuẩn: (0,1) (1,2) (2,3) (3,4) (5,6)
// (7,8) (10,11) (14,15) (21,22) (30,31) (44,45) — mỗi bước xuống 1 code letter hoặc mỗi bước lên 1
// mức AQL đều dịch đúng 1 nấc trong chuỗi này (tính chất "đường chéo" nổi tiếng của Z1.4/MIL-STD-
// 105E). Ô nào bảng gốc dùng mũi tên (arrow — đổi sang cỡ mẫu của code letter khác) thì để trống ở
// đây (model hiện tại chỉ chấp nhận 1 `n` cố định cho mỗi hàng, không diễn đạt được arrow) — QC nhập
// tay khi rơi vào ô trống, không auto-suggest.
//
// ⚠️ Bảng dưới đây do Claude tự điền lại từ kiến thức chuẩn (không tra trực tiếp bản giấy gốc) —
// BẮT BUỘC QC/kỹ thuật đối chiếu từng ô với bảng ANSI/ASQ Z1.4 (hoặc ISO 2859-1/MIL-STD-105E) chính
// thức và ký duyệt trước khi coi là số liệu go-live.
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
    acRe: {
      0.65: [14, 15],
      1.0: [21, 22],
      1.5: [30, 31],
      2.5: [44, 45],
    },
  },
  P: {
    n: 800,
    acRe: {
      0.65: [21, 22],
      1.0: [30, 31],
      1.5: [44, 45],
    },
  },
  Q: {
    n: 1250,
    acRe: {
      0.65: [30, 31],
      1.0: [44, 45],
    },
  },
  R: {
    n: 2000,
    acRe: {
      0.65: [44, 45],
    },
  },
};

export type AqlPlan = {
  codeLetter: string;
  sampleSize: number;
  ac: number;
  re: number;
};

export function resolveAqlPlan(
  lotSize: number,
  level: IqcInspectionLevel,
  aql: number,
): AqlPlan | undefined {
  const range = LOT_SIZE_CODE_LETTER.find((row) => lotSize <= row.max);
  const codeLetter = range?.[level];
  const plan = codeLetter ? SAMPLING_PLAN[codeLetter] : undefined;
  const acRe = plan?.acRe[aql];

  if (!codeLetter || !plan || !acRe) {
    return undefined;
  }

  return { codeLetter, sampleSize: plan.n, ac: acRe[0], re: acRe[1] };
}

/** Số lỗi đếm được (`defectQty`) so `ac` của chính plan đó — `defectQty ≤ ac` thì PASS, ngược lại
 * FAIL. Dùng để tự suy `resultAuto` lúc `confirmOqc` (`OqcService`) — QC vẫn được ghi đè `result`
 * (`E201`, bắt buộc kèm lý do khi lệch). */
export function resolveAqlResult(plan: AqlPlan, defectQty: number): IqcResult {
  return defectQty <= plan.ac ? IqcResult.PASS : IqcResult.FAIL;
}
