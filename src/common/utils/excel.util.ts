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

// Pin về giờ VN thay vì giờ local server — tránh lệch ngày khi server chạy múi giờ khác.
export function formatVnDate(date: Date | null): string {
  if (!date) return '';

  return DateTime.fromJSDate(date)
    .setZone('Asia/Ho_Chi_Minh')
    .toFormat('dd/MM/yyyy');
}


/**
 * Format timestamp theo múi giờ Việt Nam.
 * Dùng cho các cột `timestamp` như `createdAt`/`updatedAt`.
 */
export function formatVnDateTime(date: Date | null): string {
  if (!date) return '';

  return DateTime.fromJSDate(date, {
    zone: 'Asia/Ho_Chi_Minh',
  }).toFormat('dd/MM/yyyy HH:mm');
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
