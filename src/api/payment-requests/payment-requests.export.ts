import {
  formatVnDate,
  formatVnDateTime,
  type ExcelColumn,
} from '../../common/utils/excel.util';
import { PaymentRequestStatus } from '../../database/schemas';

export interface PaymentRequestExport {
  code: string;
  poCode: string;
  supplier: { name: string; code: string };
  requestedAmount: number;
  extraCost: number;
  extraCostNote?: string | null;
  dueDate: Date;
  status: PaymentRequestStatus;
  paidAt: Date | null;
  cancellationReason: string | null;
  supplierInvoiceNo: string | null;
  isUrgent: boolean;
  note: string | null;
  creatorName: string | null;
  createdAt: Date;
}

const PAYMENT_REQUEST_STATUS_LABELS: Record<PaymentRequestStatus, string> = {
  [PaymentRequestStatus.DRAFT]: 'Nháp',
  [PaymentRequestStatus.PENDING]: 'Chờ thanh toán',
  [PaymentRequestStatus.REJECTED]: 'Bị từ chối',
  [PaymentRequestStatus.PAID]: 'Đã thanh toán',
  [PaymentRequestStatus.CANCELLED]: 'Đã hủy',
};

export const PAYMENT_REQUEST_EXPORT_COLUMNS: ExcelColumn<PaymentRequestExport>[] =
  [
    { header: 'Mã YCTT', value: (row) => row.code },
    { header: 'Mã PO', value: (row) => row.poCode },
    { header: 'Nhà cung cấp', value: (row) => row.supplier.name, width: 25 },
    { header: 'Mã NCC', value: (row) => row.supplier.code },
    { header: 'Số hóa đơn', value: (row) => row.supplierInvoiceNo },
    {
      header: 'Giá trị thanh toán',
      value: (row) => row.requestedAmount,
      numFmt: '#,##0',
    },
    {
      header: 'Chi phí phát sinh',
      value: (row) => row.extraCost,
      numFmt: '#,##0',
    },
    { header: 'Lý do phát sinh', value: (row) => row.extraCostNote ?? '' },
    { header: 'Hạn thanh toán', value: (row) => formatVnDate(row.dueDate) },
    {
      header: 'Mức độ',
      value: (row) => (row.isUrgent ? 'Gấp' : 'Bình thường'),
    },
    {
      header: 'Trạng thái',
      value: (row) => PAYMENT_REQUEST_STATUS_LABELS[row.status],
    },
    {
      header: 'Ngày đã thanh toán',
      value: (row) => formatVnDateTime(row.paidAt),
    },
    { header: 'Lý do huỷ', value: (row) => row.cancellationReason },
    { header: 'Ghi chú', value: (row) => row.note, width: 30 },
    { header: 'Người tạo', value: (row) => row.creatorName },
    { header: 'Ngày tạo', value: (row) => formatVnDateTime(row.createdAt) },
  ];
