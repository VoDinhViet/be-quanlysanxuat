import { Workbook } from 'exceljs';

export const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export interface ExcelColumn<T> {
  header: string;
  width?: number;
  numFmt?: string;
  value: (row: T) => string | number | null;
}

/** Ô nhận công thức kèm kết quả đã tính: trình xem không tính lại công thức vẫn hiện đúng số. */
export type ExcelCellValue =
  | string
  | number
  | Date
  | null
  | { formula: string; result: number };

export interface ExcelTemplateColumn<T> {
  value: (record: T, rowNumber: number) => ExcelCellValue;
  /** Ghi đè định dạng số của template cho riêng ô này; không trả gì thì giữ định dạng của template. */
  numFmtOf?: (record: T) => string | undefined;
}

/** Điểm đóng gói ExcelJS duy nhất trong repo — mọi export khác chỉ khai `ExcelColumn[]` hoặc
 * `ExcelTemplateColumn[]`, không tự đụng `Workbook`. Dòng header in đậm + đóng băng + autoFilter là
 * format cố định cho mọi export không dùng template. */
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

/**
 * Đổ dữ liệu vào file mẫu thay vì vẽ lại style bằng code, để font, viền, độ rộng cột, tiêu đề và
 * định dạng có điều kiện giữ đúng như file khách đưa.
 *
 * Rules:
 * - Template chỉ có một dòng khung ở `firstDataRow` (ô trống, đã có style); mọi dòng dữ liệu chép
 *   style, chiều cao và dropdown của dòng khung đó.
 * - `columns[i]` ghi vào cột thứ `i + 1`; ô trả `null` vẫn được ghi để xoá giá trị cũ.
 * - Định dạng số lấy từ template; chỉ ô nào cần số lẻ mới ghi đè qua `numFmtOf`.
 * - Vùng định dạng có điều kiện và `autoFilter` kéo xuống dòng dữ liệu cuối; không có dòng nào thì
 *   giữ dòng khung trống.
 * - Template là sheet đầu tiên; cột bắt đầu autoFilter lấy từ chính template.
 */
export async function buildXlsxFromTemplate<T>(options: {
  template: Buffer;
  firstDataRow: number;
  columns: ExcelTemplateColumn<T>[];
  records: T[];
}): Promise<Buffer> {
  const { template, firstDataRow, columns, records } = options;

  const workbook = new Workbook();
  await workbook.xlsx.load(template as unknown as ArrayBuffer);
  const worksheet = workbook.worksheets[0];

  const skeletonRow = worksheet.getRow(firstDataRow);
  const rowHeight = skeletonRow.height;
  const columnStyles = columns.map((_, index) =>
    structuredClone(skeletonRow.getCell(index + 1).style),
  );
  const columnValidations = columns.map(
    (_, index) => skeletonRow.getCell(index + 1).dataValidation,
  );

  const lastRowNumber = firstDataRow + Math.max(records.length, 1) - 1;
  const lastColumnLetter = worksheet.getColumn(columns.length).letter;

  records.forEach((record, recordIndex) => {
    const rowNumber = firstDataRow + recordIndex;
    const worksheetRow = worksheet.getRow(rowNumber);
    worksheetRow.height = rowHeight;

    columns.forEach((column, columnIndex) => {
      const cell = worksheetRow.getCell(columnIndex + 1);
      const style = structuredClone(columnStyles[columnIndex]);
      const numFmt = column.numFmtOf?.(record);
      if (numFmt) {
        style.numFmt = numFmt;
      }

      cell.value = column.value(record, rowNumber);
      cell.style = style;
      if (columnValidations[columnIndex]) {
        cell.dataValidation = { ...columnValidations[columnIndex] };
      }
    });
  });

  // `conditionalFormattings` có trong model ExcelJS nhưng thiếu trong `.d.ts`.
  const { conditionalFormattings } = worksheet as unknown as {
    conditionalFormattings: { ref: string }[];
  };
  for (const formatting of conditionalFormattings) {
    formatting.ref = formatting.ref.replace(
      /[A-Z]+\d+$/,
      `${lastColumnLetter}${lastRowNumber}`,
    );
  }

  // Template khai `autoFilter` dạng chuỗi `B4:P4`; chỉ kéo điểm cuối xuống dòng dữ liệu cuối.
  if (typeof worksheet.autoFilter === 'string') {
    const [filterStart] = worksheet.autoFilter.split(':');
    worksheet.autoFilter = `${filterStart}:${lastColumnLetter}${lastRowNumber}`;
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
