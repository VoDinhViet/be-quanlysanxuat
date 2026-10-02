import type { XlsxRow } from '../../common/utils/excel.util';
import type { ErrorDetailDto } from '../../common/dto/error-detail.dto';

/** Đường dẫn file mẫu lưu sẵn trong repo; `nest-cli.json` copy thư mục `templates` sang `dist`. */
export const ITEM_IMPORT_TEMPLATE_FILE = 'items-import-template.xlsx';
export const ITEM_IMPORT_TEMPLATE_DOWNLOAD_NAME = 'mau-nhap-vat-tu.xlsx';
export const ITEM_IMPORT_MAX_ROWS = 1000;
export const ITEM_IMPORT_MAX_FILE_SIZE = 5 * 1024 * 1024;

type ItemImportKey =
  | 'code'
  | 'revision'
  | 'name'
  | 'unitCode'
  | 'supplierCode'
  | 'clientCode'
  | 'minStock'
  | 'specificWeight'
  | 'directGrade'
  | 'technicalStandard'
  | 'dimensions'
  | 'colorSurface'
  | 'origin'
  | 'leadTime'
  | 'description'
  | 'note';

interface ItemImportField {
  key: ItemImportKey;
  header: string;
  required?: boolean;
  maxLength?: number;
  numeric?: boolean;
}

/** Thứ tự cột = thứ tự cột trong file mẫu. Header là khoá nhận diện nên phải khớp đúng file mẫu. */
export const ITEM_IMPORT_FIELDS: ItemImportField[] = [
  {
    key: 'code',
    header: 'Mã vật tư',
    required: true,
    maxLength: 50,
  },
  { key: 'revision', header: 'Phiên bản', maxLength: 50 },
  {
    key: 'name',
    header: 'Tên vật tư',
    required: true,
    maxLength: 255,
  },
  {
    key: 'unitCode',
    header: 'Mã đơn vị tính',
    required: true,
    maxLength: 50,
  },
  {
    key: 'supplierCode',
    header: 'Mã nhà cung cấp',
    maxLength: 50,
  },
  { key: 'clientCode', header: 'Mã khách hàng', maxLength: 50 },
  {
    key: 'minStock',
    header: 'Định mức tồn tối thiểu',
    numeric: true,
  },
  {
    key: 'specificWeight',
    header: 'Trọng lượng riêng',
    numeric: true,
  },
  {
    key: 'directGrade',
    header: 'Mác vật tư',
    maxLength: 255,
  },
  {
    key: 'technicalStandard',
    header: 'Tiêu chuẩn kỹ thuật',
    maxLength: 255,
  },
  {
    key: 'dimensions',
    header: 'Quy cách',
    maxLength: 255,
  },
  { key: 'colorSurface', header: 'Màu/Bề mặt', maxLength: 255 },
  { key: 'origin', header: 'Xuất xứ', maxLength: 255 },
  {
    key: 'leadTime',
    header: 'Thời gian giao hàng',
    maxLength: 100,
  },
  { key: 'description', header: 'Mô tả', maxLength: 2000 },
  { key: 'note', header: 'Ghi chú', maxLength: 1000 },
];

export interface ParsedItemImportRow {
  rowNumber: number;
  code: string;
  revision?: string;
  name: string;
  unitCode: string;
  supplierCode?: string;
  clientCode?: string;
  minStock?: number;
  specificWeight?: number;
  directGrade?: string;
  technicalStandard?: string;
  dimensions?: string;
  colorSurface?: string;
  origin?: string;
  leadTime?: string;
  description?: string;
  note?: string;
}

/** Lỗi một ô của file import; giữ `rowNumber` có cấu trúc để sắp theo dòng trước khi dựng `details`. */
export interface ImportRowError {
  rowNumber: number;
  header: string;
  code: string;
  message: string;
}

export function toImportErrorDetails(
  errors: ImportRowError[],
): ErrorDetailDto[] {
  return [...errors]
    .sort((a, b) => a.rowNumber - b.rowNumber)
    .map(({ rowNumber, header, code, message }) => ({
      property: `Dòng ${rowNumber} - ${header}`,
      code,
      message,
    }));
}

export function hasMatchingImportHeader(headerCells: string[]): boolean {
  return ITEM_IMPORT_FIELDS.every(
    (field, index) => headerCells[index] === field.header,
  );
}

/** Kiểm từng ô theo định nghĩa cột (bắt buộc, độ dài, số ≥ 0). Chưa tra DB — phần đó ở service. */
export function parseImportRows(rows: XlsxRow[]): {
  parsed: ParsedItemImportRow[];
  errors: ImportRowError[];
} {
  const parsed: ParsedItemImportRow[] = [];
  const errors: ImportRowError[] = [];

  for (const { rowNumber, cells } of rows) {
    const values: Record<string, string | number | undefined> = {};
    let rowValid = true;

    ITEM_IMPORT_FIELDS.forEach((field, index) => {
      const raw = cells[index];
      const fail = (code: string, message: string) => {
        rowValid = false;
        errors.push({ rowNumber, header: field.header, code, message });
      };

      if (raw === '') {
        if (field.required) fail('required', 'Không được để trống');
        return;
      }

      if (field.numeric) {
        const value = Number(raw.replace(/,/g, ''));
        if (!Number.isFinite(value) || value < 0) {
          fail('invalid', 'Phải là số không âm');
          return;
        }
        values[field.key] = value;
        return;
      }

      if (field.maxLength && raw.length > field.maxLength) {
        fail('too_long', `Tối đa ${field.maxLength} ký tự`);
        return;
      }
      values[field.key] = raw;
    });

    if (rowValid) parsed.push({ rowNumber, ...values } as ParsedItemImportRow);
  }

  return { parsed, errors };
}
