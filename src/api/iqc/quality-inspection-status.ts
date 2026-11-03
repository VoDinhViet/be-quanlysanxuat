import {
  IqcStatus,
  OqcStatus,
  QualityInspectionStatus,
} from '../../database/schemas';

/** Đường ghi (`confirmIqc`/`confirmOqc`, `createIqc`) tính state machine theo
 * `IqcStatus`/`OqcStatus` (rõ nghĩa nghiệp vụ hơn `IN_PROGRESS` gộp chung) rồi dịch sang
 * `quality_inspections.status` qua hàm này trước khi ghi DB. Đường đọc (response/filter DTO)
 * không dịch ngược: trả thẳng `QualityInspectionStatus` từ DB. */
export function mapToQualityInspectionStatus(
  status: IqcStatus | OqcStatus,
): QualityInspectionStatus {
  switch (status) {
    case IqcStatus.NOT_INSPECTED:
    case OqcStatus.NOT_INSPECTED:
      return QualityInspectionStatus.DRAFT;
    case IqcStatus.PENDING:
    case OqcStatus.PENDING:
      return QualityInspectionStatus.PENDING;
    case IqcStatus.WAITING_RETURN:
    case OqcStatus.REWORK:
      return QualityInspectionStatus.IN_PROGRESS;
    case IqcStatus.COMPLETED:
    case OqcStatus.COMPLETED:
      return QualityInspectionStatus.COMPLETED;
  }
}
