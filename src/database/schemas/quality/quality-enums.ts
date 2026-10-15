import { pgEnum } from 'drizzle-orm/pg-core';

export enum QualityInspectionType {
  IQC = 'IQC',
  OQC = 'OQC',
}

export const qualityInspectionTypeEnum = pgEnum('quality_inspection_type', [
  QualityInspectionType.IQC,
  QualityInspectionType.OQC,
]);

// `IN_PROGRESS` dùng chung cho IQC đang chờ trả NCC (`WAITING_RETURN`) và OQC `REWORK`: DB không
// phân biệt được, service tự phân biệt. `CANCELLED` chỉ ghi từ `cancelReceiptInspections` khi
// phiếu nhập nguồn bị huỷ.
export enum QualityInspectionStatus {
  DRAFT = 'DRAFT',
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export const qualityInspectionStatusEnum = pgEnum('quality_inspection_status', [
  QualityInspectionStatus.DRAFT,
  QualityInspectionStatus.PENDING,
  QualityInspectionStatus.IN_PROGRESS,
  QualityInspectionStatus.COMPLETED,
  QualityInspectionStatus.CANCELLED,
]);

// `PENDING`/`HOLD`/`PARTIAL` để dành, chưa có đường ghi — chặn bằng
// `chk_quality_inspections_decision_in_use`, chỉ `PASS`/`FAIL` dùng thật.
export enum QualityInspectionDecision {
  PENDING = 'PENDING',
  PASS = 'PASS',
  FAIL = 'FAIL',
  HOLD = 'HOLD',
  PARTIAL = 'PARTIAL',
}

export const qualityInspectionDecisionEnum = pgEnum(
  'quality_inspection_decision',
  [
    QualityInspectionDecision.PENDING,
    QualityInspectionDecision.PASS,
    QualityInspectionDecision.FAIL,
    QualityInspectionDecision.HOLD,
    QualityInspectionDecision.PARTIAL,
  ],
);

// Chứng từ nguồn của phiếu (polymorphic, `origin_type` + `origin_id`, không FK). `purchaseOrderId`/
// `supplierId`/`clientId`/`productionJobId`/`productionJobOperationId` vẫn là FK thật trên
// `quality_inspections`. `MANUAL` = không có chứng từ nguồn (IQC tạo tay).
export enum QualityInspectionOriginType {
  INVENTORY_RECEIPT = 'INVENTORY_RECEIPT',
  OUTSOURCING_RECEIPT_ITEM = 'OUTSOURCING_RECEIPT_ITEM',
  MANUAL = 'MANUAL',
}

export const qualityInspectionOriginTypeEnum = pgEnum(
  'quality_inspection_origin_type',
  [
    QualityInspectionOriginType.INVENTORY_RECEIPT,
    QualityInspectionOriginType.OUTSOURCING_RECEIPT_ITEM,
    QualityInspectionOriginType.MANUAL,
  ],
);

// Một cột enum dùng chung cho IQC và OQC (không tách bảng tra cứu). Giá trị viết literal, không
// import `IqcDisposition`/`OqcDisposition` bên dưới trong cùng file, để khỏi lặp.
export const qualityDispositionEnum = pgEnum('quality_disposition', [
  'CONCESSION',
  'SORT',
  'RETURN',
  'ACCEPT',
  'REWORK',
  'SCRAP',
]);

export enum QcKind {
  INCOMING = 'INCOMING',
  OUTGOING = 'OUTGOING',
}

export enum IqcResult {
  PASS = 'PASS',
  FAIL = 'FAIL',
}

/**
 * Chỉ có ý nghĩa khi `decision = FAIL`. `IqcDisposition` cho IQC, `OqcDisposition` cho OQC; hai enum
 * TS này chung một cột Postgres `quality_disposition`, dùng cho `.$type<>()` trên
 * `quality_inspections`/`quality_inspection_results`.
 */
export enum IqcDisposition {
  CONCESSION = 'CONCESSION',
  SORT = 'SORT',
  RETURN = 'RETURN',
}

export enum OqcDisposition {
  ACCEPT = 'ACCEPT',
  REWORK = 'REWORK',
  SCRAP = 'SCRAP',
  SORT = 'SORT',
}

/**
 * Từ vựng `status` nội bộ, không có `pgEnum` riêng (cột thật là `QualityInspectionStatus`). Dùng ở
 * đường **ghi** để tính status trước khi map sang giá trị DB bằng `mapToQualityInspectionStatus()`
 * (`src/api/iqc/quality-inspection-status.util.ts`).
 */
export enum IqcStatus {
  NOT_INSPECTED = 'NOT_INSPECTED',
  PENDING = 'PENDING',
  WAITING_RETURN = 'WAITING_RETURN',
  COMPLETED = 'COMPLETED',
}

export enum OqcStatus {
  NOT_INSPECTED = 'NOT_INSPECTED',
  PENDING = 'PENDING',
  REWORK = 'REWORK',
  COMPLETED = 'COMPLETED',
}
