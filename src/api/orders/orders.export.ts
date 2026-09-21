import {
  formatExcelDate,
  type ExcelColumn,
} from '../../common/utils/excel.util';
import { Currency, OrderStatus } from '../../database/schemas';

export interface OrderExport {
  code: string;
  clientName: string | null;
  clientCode: string | null;
  assignedUserName: string | null;
  orderDate: Date;
  dueDate: Date | null;
  status: OrderStatus;
  currency: Currency;
  exchangeRate: number;
  subtotal: number;
  discountAmount: number;
  vatAmount: number;
  shippingFee: number;
  total: number;
  totalVnd: number;
  note: string | null;
}

const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  [OrderStatus.DRAFT]: 'Nháp',
  [OrderStatus.PENDING_CONFIRMATION]: 'Chờ xác nhận',
  [OrderStatus.REJECTED]: 'Từ chối',
  [OrderStatus.AWAITING_PRODUCTION]: 'Chờ sản xuất',
  [OrderStatus.IN_PROGRESS]: 'Đang sản xuất',
  [OrderStatus.COMPLETED]: 'Hoàn thành',
  [OrderStatus.CANCELLED]: 'Đã huỷ',
};

export const ORDER_EXPORT_COLUMNS: ExcelColumn<OrderExport>[] = [
  { header: 'Mã đơn', value: (row) => row.code },
  { header: 'Khách hàng', value: (row) => row.clientName, width: 30 },
  { header: 'Mã khách hàng', value: (row) => row.clientCode },
  { header: 'NVKD phụ trách', value: (row) => row.assignedUserName, width: 25 },
  { header: 'Ngày đặt', value: (row) => formatExcelDate(row.orderDate) },
  { header: 'Ngày giao', value: (row) => formatExcelDate(row.dueDate) },
  { header: 'Trạng thái', value: (row) => ORDER_STATUS_LABELS[row.status] },
  { header: 'Tiền tệ', value: (row) => row.currency },
  {
    header: 'Tỷ giá',
    value: (row) => row.exchangeRate,
    numFmt: '#,##0.######',
  },
  {
    header: 'Tổng tiền hàng',
    value: (row) => row.subtotal,
    numFmt: '#,##0.00',
    width: 18,
  },
  {
    header: 'Chiết khấu',
    value: (row) => row.discountAmount,
    numFmt: '#,##0.00',
  },
  { header: 'Thuế VAT', value: (row) => row.vatAmount, numFmt: '#,##0.00' },
  {
    header: 'Phí vận chuyển',
    value: (row) => row.shippingFee,
    numFmt: '#,##0.00',
  },
  {
    header: 'Tổng thanh toán',
    value: (row) => row.total,
    numFmt: '#,##0.00',
    width: 18,
  },
  {
    header: 'Tổng thanh toán (VND)',
    value: (row) => row.totalVnd,
    numFmt: '#,##0',
  },
  { header: 'Ghi chú', value: (row) => row.note, width: 30 },
];
