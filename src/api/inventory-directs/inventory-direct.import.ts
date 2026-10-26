import type { ExcelColumn } from '../../common/utils/excel.util';

export const INVENTORY_IMPORT_MAX_ROWS = 1000;
export const INVENTORY_IMPORT_TEMPLATE_NAME = 'mau-nhap-ton-kho.xlsx';

export interface InventoryImportTemplateRow {
  code: string;
  revision: string;
  name: string;
  unitName: string;
  onHand: number;
}

/** Thứ tự và tiêu đề cột phải khớp `inventoryImportHeaders` bên web — web dùng header để nhận
 * diện file mẫu. Cột "Tồn thực tế" để trống, không gắn `numFmt` để ô người dùng gõ không bị
 * định dạng thành chuỗi có dấu phân cách hàng nghìn. */
export const INVENTORY_IMPORT_TEMPLATE_COLUMNS: ExcelColumn<InventoryImportTemplateRow>[] =
  [
    {
      header: 'Mã vật tư',
      width: 20,
      value: (templateRow) => templateRow.code,
    },
    {
      header: 'Phiên bản',
      width: 12,
      value: (templateRow) => templateRow.revision,
    },
    {
      header: 'Tên vật tư',
      width: 40,
      value: (templateRow) => templateRow.name,
    },
    { header: 'ĐVT', width: 10, value: (templateRow) => templateRow.unitName },
    {
      header: 'Tồn hiện tại',
      width: 15,
      numFmt: '#,##0.###',
      value: (templateRow) => templateRow.onHand,
    },
    { header: 'Tồn thực tế', width: 15, value: () => null },
    { header: 'Ghi chú', width: 30, value: () => null },
  ];

const actualQuantityPattern = /^\d{1,12}([.,]\d{1,3})?$/;

/** Không nhận dấu phân cách hàng nghìn: "1.000" là 1 chứ không phải một nghìn, nên chỉ cho phép
 * một dấu thập phân và tối đa 3 số lẻ (khớp `numeric(18,3)`). */
export function parseActualQuantity(raw: string): number | null {
  const value = raw.trim();
  if (!actualQuantityPattern.test(value)) return null;

  return Number(value.replace(',', '.'));
}

export function roundQuantity(value: number): number {
  return Math.round(value * 1000) / 1000;
}
