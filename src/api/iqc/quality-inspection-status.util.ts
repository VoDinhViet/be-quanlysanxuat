import {
  IqcStatus,
  OqcStatus,
  QualityInspectionStatus,
} from '../../database/schemas';

/** Đường ghi (`resolveIqcStatus`/`resolveOqcStatus`, `confirmIqc`/`confirmOqc`,
 * `createInspectionsFromReceipt`/`createInspectionsFromOutsourcingReceipt`) vẫn tính state machine
 * theo `IqcStatus`/`OqcStatus` cũ (rõ nghĩa nghiệp vụ hơn `IN_PROGRESS` gộp chung), rồi dịch sang
 * `quality_inspections.status` qua hàm này trước khi ghi DB. Đường đọc (response/filter DTO) không
 * còn dịch ngược — trả thẳng `QualityInspectionStatus` từ DB (API đã lộ vocabulary mới,
 * `docs/decisions/quality-schema-rename.md`).
 */
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
