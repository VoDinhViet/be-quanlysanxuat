import {
  formatExcelDate,
  formatExcelDateTime,
  type ExcelColumn,
} from '../../common/utils/excel.util';
import { FulfillmentType, OutboundOrderStatus } from '../../database/schemas';

export interface OutboundOrderExport {
  code: string;
  clientName: string;
  clientCode: string;
  fulfillmentDate: Date;
  fulfillmentType: FulfillmentType;
  status: OutboundOrderStatus;
  orderCodes: string[];
  totalQuantity: number;
  note: string | null;
  creatorName: string | null;
  createdAt: Date;
}

const OUTBOUND_ORDER_STATUS_LABELS: Record<OutboundOrderStatus, string> = {
  [OutboundOrderStatus.DRAFT]: 'Nháp',
  [OutboundOrderStatus.PENDING_APPROVAL]: 'Chờ duyệt',
  [OutboundOrderStatus.PENDING_DELIVERY]: 'Chờ xác nhận giao',
  [OutboundOrderStatus.DELIVERED]: 'Đã giao',
  [OutboundOrderStatus.CANCELLED]: 'Đã hủy',
  [OutboundOrderStatus.REJECTED]: 'Bị từ chối',
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
      value: (row) => formatExcelDate(row.fulfillmentDate),
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
      header: 'Mã đơn hàng nguồn',
      value: (row) => row.orderCodes.join(', ') || null,
      width: 30,
    },
    {
      header: 'Tổng SL giao',
      value: (row) => row.totalQuantity,
      numFmt: '#,##0.###',
    },
    { header: 'Ghi chú', value: (row) => row.note, width: 30 },
    { header: 'Người tạo', value: (row) => row.creatorName },
    { header: 'Ngày tạo', value: (row) => formatExcelDateTime(row.createdAt) },
  ];
