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

export interface XlsxRow {
  /** Số dòng trong file (1-based, header là dòng 1) — để báo lỗi đúng dòng người dùng thấy. */
  rowNumber: number;
  cells: string[];
}

/** Đọc sheet đầu tiên thành ma trận chuỗi (đã trim), `columnCount` ô mỗi dòng. Bỏ dòng trống hoàn toàn. */
export async function readXlsxRows(
  buffer: Buffer,
  columnCount: number,
): Promise<XlsxRow[]> {
  const workbook = new Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) return [];

  const rows: XlsxRow[] = [];
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const cells = Array.from({ length: columnCount }, (_, index) =>
      row.getCell(index + 1).text.trim(),
    );
    if (cells.some((cell) => cell !== '')) rows.push({ rowNumber, cells });
  });

  return rows;
}
