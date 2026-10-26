import {
  formatVnDate,
  formatVnDateTime,
  type ExcelColumn,
} from '../../common/utils/excel.util';
import {
  FulfillmentType,
  OutboundOrderInvoiceStatus,
  OutboundOrderStatus,
} from '../../database/schemas';

export interface OutboundOrderExport {
  code: string;
  clientName: string;
  clientCode: string;
  fulfillmentDate: Date;
  fulfillmentType: FulfillmentType;
  status: OutboundOrderStatus;
  invoiceStatus: OutboundOrderInvoiceStatus;
  invoiceNo: string | null;
  invoiceDate: Date | null;
  orderCodes: string[];
  buyerPoNos: string[];
  totalQuantity: number;
  note: string | null;
  creatorName: string | null;
  createdAt: Date;
}

const OUTBOUND_ORDER_STATUS_LABELS: Record<OutboundOrderStatus, string> = {
  [OutboundOrderStatus.DRAFT]: 'Nháp',
  [OutboundOrderStatus.PENDING_APPROVAL]: 'Chờ duyệt',
  [OutboundOrderStatus.PENDING_DELIVERY]: 'Chờ xuất kho',
  [OutboundOrderStatus.DELIVERED]: 'Đã giao',
  [OutboundOrderStatus.CANCELLED]: 'Đã hủy',
  [OutboundOrderStatus.REJECTED]: 'Bị từ chối',
};

const INVOICE_STATUS_LABELS: Record<OutboundOrderInvoiceStatus, string> = {
  [OutboundOrderInvoiceStatus.NOT_ISSUED]: 'Chưa xuất',
  [OutboundOrderInvoiceStatus.ISSUED]: 'Đã xuất',
};

const FULFILLMENT_TYPE_LABELS: Record<FulfillmentType, string> = {
  [FulfillmentType.STANDARD]: 'Giao tận nơi',
  [FulfillmentType.EXPRESS]: 'Giao nhanh',
  [FulfillmentType.PICKUP]: 'Khách tự đến lấy',
};

export const OUTBOUND_ORDER_EXPORT_COLUMNS: ExcelColumn<OutboundOrderExport>[] =
  [
    { header: 'Mã DO', value: (row) => row.code },
    { header: 'Khách hàng', value: (row) => row.clientName, width: 25 },
    { header: 'Mã khách hàng', value: (row) => row.clientCode },
    {
      header: 'Ngày giao',
      value: (row) => formatVnDate(row.fulfillmentDate),
    },
    {
      header: 'Hình thức giao',
      value: (row) => FULFILLMENT_TYPE_LABELS[row.fulfillmentType],
    },
    {
      header: 'Trạng thái',
      value: (row) => OUTBOUND_ORDER_STATUS_LABELS[row.status],
    },
    {
      header: 'Trạng thái hóa đơn',
      value: (row) => INVOICE_STATUS_LABELS[row.invoiceStatus],
    },
    { header: 'Số hóa đơn', value: (row) => row.invoiceNo },
    {
      header: 'Ngày xuất hóa đơn',
      value: (row) => (row.invoiceDate ? formatVnDate(row.invoiceDate) : null),
    },
    {
      header: 'Mã đơn hàng nguồn',
      value: (row) => row.orderCodes.join(', ') || null,
      width: 30,
    },
    {
      header: 'Số PO',
      value: (row) => row.buyerPoNos.join(', ') || null,
      width: 30,
    },
    {
      header: 'Tổng SL giao',
      value: (row) => row.totalQuantity,
      numFmt: '#,##0.###',
    },
    { header: 'Ghi chú', value: (row) => row.note, width: 30 },
    { header: 'Người tạo', value: (row) => row.creatorName },
    { header: 'Ngày tạo', value: (row) => formatVnDateTime(row.createdAt) },
  ];
