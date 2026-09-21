import {
  formatExcelDate,
  formatExcelDateTime,
  type ExcelColumn,
} from '../../common/utils/excel.util';
import { PaymentRequestStatus } from '../../database/schemas';

export interface PaymentRequestExport {
  code: string;
  poCode: string;
  supplierName: string;
  supplierCode: string;
  requestValue: number;
  dueDate: Date;
  status: PaymentRequestStatus;
  paidAt: Date | null;
  cancellationReason: string | null;
  note: string | null;
  creatorName: string | null;
  createdAt: Date;
}

const PAYMENT_REQUEST_STATUS_LABELS: Record<PaymentRequestStatus, string> = {
  [PaymentRequestStatus.PENDING]: 'Chờ thanh toán',
  [PaymentRequestStatus.PAID]: 'Đã thanh toán',
  [PaymentRequestStatus.CANCELLED]: 'Đã hủy',
};

export const PAYMENT_REQUEST_EXPORT_COLUMNS: ExcelColumn<PaymentRequestExport>[] =
  [
    { header: 'Mã YCTT', value: (row) => row.code },
    { header: 'Mã PO', value: (row) => row.poCode },
    { header: 'Nhà cung cấp', value: (row) => row.supplierName, width: 25 },
    { header: 'Mã NCC', value: (row) => row.supplierCode },
    {
      header: 'Giá trị thanh toán',
      value: (row) => row.requestValue,
      numFmt: '#,##0',
    },
    { header: 'Hạn thanh toán', value: (row) => formatExcelDate(row.dueDate) },
    {
      header: 'Trạng thái',
      value: (row) => PAYMENT_REQUEST_STATUS_LABELS[row.status],
    },
    {
      header: 'Ngày đã thanh toán',
      value: (row) => formatExcelDateTime(row.paidAt),
    },
    { header: 'Lý do huỷ', value: (row) => row.cancellationReason },
    { header: 'Ghi chú', value: (row) => row.note, width: 30 },
    { header: 'Người tạo', value: (row) => row.creatorName },
    { header: 'Ngày tạo', value: (row) => formatExcelDateTime(row.createdAt) },
  ];
