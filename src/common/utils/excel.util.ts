import { Workbook } from 'exceljs';
import { DateTime } from 'luxon';

export const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export interface ExcelColumn<T> {
  header: string;
  width?: number;
  numFmt?: string;
  value: (row: T) => string | number | null;
}

// Cột DB là `date` lưu UTC-midnight — format ở UTC, không dùng giờ local server để tránh lệch ngày.
export function formatExcelDate(date: Date | null): string {
  return date
    ? DateTime.fromJSDate(date, { zone: 'utc' }).toFormat('dd/MM/yyyy')
    : '';
}

// Cột DB là `timestamp` (một mốc giờ thật, không phải UTC-midnight) — format theo giờ VN, khác
// `formatExcelDate` ở trên. Dùng cho `createdAt`/`updatedAt`, không dùng cho cột `date`.
export function formatExcelDateTime(date: Date | null): string {
  return date
    ? DateTime.fromJSDate(date, { zone: 'Asia/Ho_Chi_Minh' }).toFormat(
        'dd/MM/yyyy',
      )
    : '';
}

/** Điểm đóng gói ExcelJS duy nhất trong repo — mọi export khác chỉ khai `ExcelColumn[]`, không tự
 * đụng `Workbook`. Dòng header in đậm + đóng băng + autoFilter là format cố định cho mọi export. */
export async function buildXlsxBuffer<T>(
  sheetName: string,
  columns: ExcelColumn<T>[],
  rows: T[],
): Promise<Buffer> {
  const workbook = new Workbook();
  const worksheet = workbook.addWorksheet(sheetName, {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  worksheet.columns = columns.map((column) => ({
    header: column.header,
    width: column.width ?? 20,
    style: column.numFmt ? { numFmt: column.numFmt } : undefined,
  }));
  worksheet.getRow(1).font = { bold: true };
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columns.length },
  };

  for (const row of rows) {
    worksheet.addRow(columns.map((column) => column.value(row)));
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
