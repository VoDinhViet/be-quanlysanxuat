import {
  formatVnDate,
  formatVnDateTime,
  type ExcelColumn,
} from '../../common/utils/excel.util';
import { PurchaseLedgerStatus } from './purchase-ledger.constant';

export interface PurchaseLedgerExport {
  requestCode: string;
  itemCode: string;
  itemName: string;
  unitName: string;
  buyerPoNo: string | null;
  requestNote: string | null;
  quantity: number;
  quotedQuantity?: number;
  orderedQuantity: number;
  receivedQuantity: number;
  status: PurchaseLedgerStatus;
  neededDate: Date;
  note: string | null;
  createdAt: Date;
}

const PURCHASE_LEDGER_STATUS_LABELS: Record<PurchaseLedgerStatus, string> = {
  [PurchaseLedgerStatus.WAITING_TO_PURCHASE]: 'Chờ mua',
  [PurchaseLedgerStatus.QUOTING]: 'Đang báo giá',
  [PurchaseLedgerStatus.ORDERED]: 'Đã đặt hàng',
  [PurchaseLedgerStatus.RECEIVING]: 'Nhập một phần',
  [PurchaseLedgerStatus.COMPLETED]: 'Hoàn tất',
};

export const PURCHASE_LEDGER_EXPORT_COLUMNS: ExcelColumn<PurchaseLedgerExport>[] =
  [
    { header: 'Mã đề xuất', value: (row) => row.requestCode },
    { header: 'Mã vật tư', value: (row) => row.itemCode },
    { header: 'Tên vật tư', value: (row) => row.itemName, width: 30 },
    { header: 'Đơn vị tính', value: (row) => row.unitName },
    {
      header: 'PO liên quan / Lý do',
      value: (row) => row.buyerPoNo ?? row.requestNote,
      width: 30,
    },
    {
      header: 'SL cần mua',
      value: (row) => row.quantity,
      numFmt: '#,##0.###',
    },
    {
      header: 'SL đặt mua',
      value: (row) => row.orderedQuantity,
      numFmt: '#,##0.###',
    },
    {
      header: 'SL đã nhập kho',
      value: (row) => row.receivedQuantity,
      numFmt: '#,##0.###',
    },
    {
      header: 'Trạng thái',
      value: (row) => PURCHASE_LEDGER_STATUS_LABELS[row.status],
    },
    { header: 'Ngày cần', value: (row) => formatVnDate(row.neededDate) },
    { header: 'Ghi chú', value: (row) => row.note, width: 30 },
    {
      header: 'Ngày tạo',
      value: (row) => formatVnDateTime(row.createdAt),
    },
  ];
