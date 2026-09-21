import {
  formatExcelDate,
  formatExcelDateTime,
  type ExcelColumn,
} from '../../common/utils/excel.util';
import { PurchaseLedgerStatus } from './purchase-ledger.constant';

export interface PurchaseLedgerExport {
  requestCode: string;
  itemCode: string;
  itemName: string;
  unitName: string;
  productionOrderCode: string | null;
  quantity: number;
  quotedQuantity: number;
  orderedQuantity: number;
  status: PurchaseLedgerStatus;
  neededDate: Date;
  note: string | null;
  createdAt: Date;
}

const PURCHASE_LEDGER_STATUS_LABELS: Record<PurchaseLedgerStatus, string> = {
  [PurchaseLedgerStatus.WAITING_TO_PURCHASE]: 'Chờ mua',
  [PurchaseLedgerStatus.QUOTING]: 'Đang báo giá',
  [PurchaseLedgerStatus.ORDERED]: 'Đã đặt hàng',
  [PurchaseLedgerStatus.COMPLETED]: 'Hoàn tất',
};

export const PURCHASE_LEDGER_EXPORT_COLUMNS: ExcelColumn<PurchaseLedgerExport>[] =
  [
    { header: 'Mã đề xuất', value: (row) => row.requestCode },
    { header: 'Mã vật tư', value: (row) => row.itemCode },
    { header: 'Tên vật tư', value: (row) => row.itemName, width: 30 },
    { header: 'Đơn vị tính', value: (row) => row.unitName },
    { header: 'Mã LSX', value: (row) => row.productionOrderCode },
    {
      header: 'SL cần mua',
      value: (row) => row.quantity,
      numFmt: '#,##0.###',
    },
    {
      header: 'SL báo giá',
      value: (row) => row.quotedQuantity,
      numFmt: '#,##0.###',
    },
    {
      header: 'SL đặt mua',
      value: (row) => row.orderedQuantity,
      numFmt: '#,##0.###',
    },
    {
      header: 'Trạng thái',
      value: (row) => PURCHASE_LEDGER_STATUS_LABELS[row.status],
    },
    { header: 'Ngày cần', value: (row) => formatExcelDate(row.neededDate) },
    { header: 'Ghi chú', value: (row) => row.note, width: 30 },
    {
      header: 'Ngày tạo',
      value: (row) => formatExcelDateTime(row.createdAt),
    },
  ];
