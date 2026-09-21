import {
  formatExcelDateTime,
  type ExcelColumn,
} from '../../common/utils/excel.util';
import {
  OqcDisposition,
  QualityInspectionDecision,
  QualityInspectionStatus,
} from '../../database/schemas';

export interface OqcExport {
  code: string;
  jobCode: string;
  orderCode: string | null;
  operationCode: string;
  operationName: string;
  bomItemCode: string;
  bomItemName: string;
  unitName: string;
  quantity: number;
  inspectionDate: Date;
  result: QualityInspectionDecision | null;
  disposition: OqcDisposition | null;
  status: QualityInspectionStatus;
  note: string | null;
  creatorName: string | null;
  createdAt: Date;
}

// Cột `decision` DB rộng hơn vocabulary API `IqcResult` — nhãn dưới đây phủ đủ mọi giá trị enum để
// Record exhaustive, dù dòng OQC trên thực tế chỉ rơi vào null/PASS/FAIL.
const OQC_RESULT_LABELS: Record<QualityInspectionDecision, string> = {
  [QualityInspectionDecision.PENDING]: '',
  [QualityInspectionDecision.PASS]: 'PASS',
  [QualityInspectionDecision.FAIL]: 'FAIL',
  [QualityInspectionDecision.HOLD]: '',
  [QualityInspectionDecision.PARTIAL]: '',
};

const OQC_DISPOSITION_LABELS: Record<OqcDisposition, string> = {
  [OqcDisposition.ACCEPT]: 'Chấp nhận đặc biệt',
  [OqcDisposition.REWORK]: 'Trả xưởng sửa lại',
  [OqcDisposition.SCRAP]: 'Loại bỏ (Scrap)',
};

// Nhãn riêng cho OQC — cùng enum DB với IQC (`QualityInspectionStatus`) nhưng ý nghĩa nghiệp vụ
// khác (IN_PROGRESS = "đang rework", không phải "chờ trả NCC"), không tái dùng nhãn của iqc.export.ts.
const OQC_STATUS_LABELS: Record<QualityInspectionStatus, string> = {
  [QualityInspectionStatus.DRAFT]: 'Chờ kiểm',
  [QualityInspectionStatus.PENDING]: 'FAIL - chờ xử lý',
  [QualityInspectionStatus.IN_PROGRESS]: 'Đang rework',
  [QualityInspectionStatus.COMPLETED]: 'Đã QC',
  [QualityInspectionStatus.CANCELLED]: 'Đã huỷ',
};

export const OQC_EXPORT_COLUMNS: ExcelColumn<OqcExport>[] = [
  { header: 'Mã OQC', value: (row) => row.code },
  { header: 'Mã LSX', value: (row) => row.jobCode },
  { header: 'Mã đơn hàng', value: (row) => row.orderCode },
  { header: 'Mã công đoạn', value: (row) => row.operationCode },
  { header: 'Tên công đoạn', value: (row) => row.operationName, width: 25 },
  { header: 'Mã BOM item', value: (row) => row.bomItemCode },
  { header: 'Tên BOM item', value: (row) => row.bomItemName, width: 30 },
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
    value: (row) => (row.result ? OQC_RESULT_LABELS[row.result] : null),
  },
  {
    header: 'Hướng xử lý',
    value: (row) =>
      row.disposition ? OQC_DISPOSITION_LABELS[row.disposition] : null,
  },
  { header: 'Trạng thái', value: (row) => OQC_STATUS_LABELS[row.status] },
  { header: 'Ghi chú', value: (row) => row.note, width: 30 },
  { header: 'Người tạo', value: (row) => row.creatorName },
  { header: 'Ngày tạo', value: (row) => formatExcelDateTime(row.createdAt) },
];
