import {
  formatExcelDateTime,
  type ExcelColumn,
} from '../../common/utils/excel.util';
import { ItemStatus, ItemType } from '../../database/schemas';

export interface ItemExport {
  code: string;
  name: string;
  type: ItemType;
  status: ItemStatus;
  unitName: string;
  clientName: string | null;
  supplierName: string | null;
  minStock: number;
  materialGrade: string | null;
  technicalStandard: string | null;
  dimensions: string | null;
  specificWeight: number | null;
  colorSurface: string | null;
  origin: string | null;
  leadTime: string | null;
  description: string | null;
  note: string | null;
  creatorName: string | null;
  createdAt: Date;
}

const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  [ItemType.FG]: 'Thành phẩm',
  [ItemType.WIP]: 'Bán thành phẩm',
  [ItemType.RM]: 'Vật tư',
};

const ITEM_STATUS_LABELS: Record<ItemStatus, string> = {
  [ItemStatus.ACTIVE]: 'Đang sử dụng',
  [ItemStatus.INACTIVE]: 'Ngừng sử dụng',
};

export const ITEM_EXPORT_COLUMNS: ExcelColumn<ItemExport>[] = [
  { header: 'Mã hàng hoá', value: (row) => row.code },
  { header: 'Tên hàng hoá', value: (row) => row.name, width: 30 },
  { header: 'Loại', value: (row) => ITEM_TYPE_LABELS[row.type] },
  { header: 'Trạng thái', value: (row) => ITEM_STATUS_LABELS[row.status] },
  { header: 'Đơn vị tính', value: (row) => row.unitName },
  { header: 'Khách hàng', value: (row) => row.clientName, width: 25 },
  { header: 'Nhà cung cấp', value: (row) => row.supplierName, width: 25 },
  {
    header: 'Định mức tồn tối thiểu',
    value: (row) => row.minStock,
    numFmt: '#,##0.###',
  },
  { header: 'Mác vật liệu', value: (row) => row.materialGrade },
  { header: 'Tiêu chuẩn kỹ thuật', value: (row) => row.technicalStandard },
  { header: 'Quy cách', value: (row) => row.dimensions },
  {
    header: 'Trọng lượng riêng',
    value: (row) => row.specificWeight,
    numFmt: '#,##0.###',
  },
  { header: 'Màu/Bề mặt', value: (row) => row.colorSurface },
  { header: 'Xuất xứ', value: (row) => row.origin },
  { header: 'Thời gian giao hàng', value: (row) => row.leadTime },
  { header: 'Mô tả', value: (row) => row.description, width: 35 },
  { header: 'Ghi chú', value: (row) => row.note, width: 30 },
  { header: 'Người tạo', value: (row) => row.creatorName },
  { header: 'Ngày tạo', value: (row) => formatExcelDateTime(row.createdAt) },
];
