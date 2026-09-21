import {
  formatExcelDateTime,
  type ExcelColumn,
} from '../../common/utils/excel.util';
import {
  IqcDisposition,
  QualityInspectionDecision,
  QualityInspectionStatus,
} from '../../database/schemas';

export interface IqcExport {
  code: string;
  supplierName: string | null;
  clientName: string | null;
  itemCode: string;
  itemName: string;
  unitName: string;
  quantity: number;
  inspectionDate: Date;
  result: QualityInspectionDecision | null;
  disposition: IqcDisposition | null;
  status: QualityInspectionStatus;
  reason: string | null;
  note: string | null;
  creatorName: string | null;
  createdAt: Date;
}

// Cột `decision`/`status` DB rộng hơn 2 vocabulary API (IqcResult/IqcStatus) — nhãn dưới đây phủ
// đủ mọi giá trị enum để Record exhaustive, dù dòng IQC trên thực tế chỉ rơi vào tập con hợp lệ
// (CHECK `decision IS NULL OR decision IN ('PASS','FAIL')`, `status <> 'CANCELLED'`).
const IQC_RESULT_LABELS: Record<QualityInspectionDecision, string> = {
  [QualityInspectionDecision.PENDING]: '',
  [QualityInspectionDecision.PASS]: 'PASS',
  [QualityInspectionDecision.FAIL]: 'FAIL',
  [QualityInspectionDecision.HOLD]: '',
  [QualityInspectionDecision.PARTIAL]: '',
};

const IQC_DISPOSITION_LABELS: Record<IqcDisposition, string> = {
  [IqcDisposition.CONCESSION]: 'Chấp nhận đặc biệt',
  [IqcDisposition.SORT]: 'Phân loại',
  [IqcDisposition.RETURN]: 'Trả NCC',
};

const IQC_STATUS_LABELS: Record<QualityInspectionStatus, string> = {
  [QualityInspectionStatus.DRAFT]: 'Chưa kiểm',
  [QualityInspectionStatus.PENDING]: 'Chờ xử lý',
  [QualityInspectionStatus.IN_PROGRESS]: 'Chờ trả NCC',
  [QualityInspectionStatus.COMPLETED]: 'Hoàn thành',
  [QualityInspectionStatus.CANCELLED]: 'Đã huỷ',
};

export const IQC_EXPORT_COLUMNS: ExcelColumn<IqcExport>[] = [
  { header: 'Mã IQC', value: (row) => row.code },
  { header: 'Nhà cung cấp', value: (row) => row.supplierName, width: 25 },
  { header: 'Khách hàng', value: (row) => row.clientName, width: 25 },
  { header: 'Mã vật tư', value: (row) => row.itemCode },
  { header: 'Tên vật tư', value: (row) => row.itemName, width: 30 },
  { header: 'Đơn vị tính', value: (row) => row.unitName },
  {
    header: 'Số lượng',
    value: (row) => row.quantity,
    numFmt: '#,##0.###',
  },
  {
    header: 'Ngày kiểm',
    value: (row) => formatExcelDateTime(row.inspectionDate),
  },
  {
    header: 'Kết quả',
    value: (row) => (row.result ? IQC_RESULT_LABELS[row.result] : null),
  },
  {
    header: 'Hướng xử lý',
    value: (row) =>
      row.disposition ? IQC_DISPOSITION_LABELS[row.disposition] : null,
  },
  { header: 'Trạng thái', value: (row) => IQC_STATUS_LABELS[row.status] },
  { header: 'Lý do', value: (row) => row.reason },
  { header: 'Ghi chú', value: (row) => row.note, width: 30 },
  { header: 'Người tạo', value: (row) => row.creatorName },
  { header: 'Ngày tạo', value: (row) => formatExcelDateTime(row.createdAt) },
];
