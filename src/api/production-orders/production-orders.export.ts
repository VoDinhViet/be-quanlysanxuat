import {
  formatExcelDate,
  formatExcelDateTime,
  type ExcelColumn,
} from '../../common/utils/excel.util';
import { ProductionOrderStatus } from '../../database/schemas';

export interface ProductionOrderExport {
  code: string | null;
  orderCode: string;
  clientName: string | null;
  orderDate: Date;
  dueDate: Date | null;
  status: ProductionOrderStatus;
  note: string | null;
  productionOrderNote: string | null;
  creatorName: string | null;
  createdAt: Date;
}

const PRODUCTION_ORDER_STATUS_LABELS: Record<ProductionOrderStatus, string> = {
  [ProductionOrderStatus.PENDING]: 'Chờ duyệt',
  [ProductionOrderStatus.APPROVED]: 'Đã duyệt',
  [ProductionOrderStatus.COMPLETED]: 'Hoàn thành',
};

export const PRODUCTION_ORDER_EXPORT_COLUMNS: ExcelColumn<ProductionOrderExport>[] =
  [
    { header: 'Mã LSX', value: (row) => row.code },
    { header: 'Mã đơn hàng', value: (row) => row.orderCode },
    { header: 'Khách hàng', value: (row) => row.clientName, width: 25 },
    { header: 'Ngày đặt', value: (row) => formatExcelDate(row.orderDate) },
    {
      header: 'Ngày giao yêu cầu',
      value: (row) => formatExcelDate(row.dueDate),
    },
    {
      header: 'Trạng thái',
      value: (row) => PRODUCTION_ORDER_STATUS_LABELS[row.status],
    },
    { header: 'Ghi chú đơn hàng', value: (row) => row.note, width: 30 },
    {
      header: 'Ghi chú LSX',
      value: (row) => row.productionOrderNote,
      width: 30,
    },
    { header: 'Người tạo', value: (row) => row.creatorName },
    { header: 'Ngày tạo', value: (row) => formatExcelDateTime(row.createdAt) },
  ];
