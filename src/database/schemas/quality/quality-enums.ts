import { pgEnum } from 'drizzle-orm/pg-core';

// Chuyển từ `qc-requests.ts` sang đây — không đổi tên Postgres type (`qc_inspection_level`),
// thuần tổ chức lại chỗ khai báo cho migration schema QC (`quality_inspections`/
// `quality_inspection_results` dùng chung enum này với `qc_aql_plans`/`qc_aql_rules`).
export enum IqcInspectionLevel {
  I = 'I',
  II = 'II',
  III = 'III',
}

export const qcInspectionLevelEnum = pgEnum('qc_inspection_level', [
  IqcInspectionLevel.I,
  IqcInspectionLevel.II,
  IqcInspectionLevel.III,
]);

export enum QualityInspectionType {
  IQC = 'IQC',
  OQC = 'OQC',
}

export const qualityInspectionTypeEnum = pgEnum('quality_inspection_type', [
  QualityInspectionType.IQC,
  QualityInspectionType.OQC,
]);

// `IN_PROGRESS` gộp 2 giá trị cũ `WAITING_RETURN`(IQC)/`REWORK`(OQC) — DB không còn tự phân biệt
// được IQC đang WAITING_RETURN với OQC đang REWORK (mất so với `qc_status` cũ), chốt này chuyển
// xuống service. `CANCELLED` để dành, chưa có đường ghi — chặn bằng
// `chk_quality_inspections_status_in_use`.
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
// `chk_quality_inspections_decision_in_use`, chỉ `PASS`/`FAIL` dùng thật (= `qc_result` cũ).
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

// Thay 3 cột chứng từ nguồn cũ (`inventoryReceiptId`/`outsourcingReceiptId`/
// `outsourcingReceiptItemId`) — KHÔNG bao gồm `purchaseOrderId`/`supplierId`/`clientId`/
// `productionJobId`/`productionJobOperationId`, 5 cột đó giữ nguyên làm FK thật (xem
// `quality-inspections.ts`). `MANUAL` = không chứng từ nguồn nào (IQC tạo tay, hoặc phiếu nhập
// ADJUSTMENT).
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

// Đổi tên Postgres type từ `qc_disposition` — giá trị giữ nguyên, `disposition` vẫn là cột enum
// (không tách bảng tra cứu, xem `docs/decisions/qc-data-model.md` mục kế thừa). Giá trị viết literal
// (không import `IqcDisposition`/`OqcDisposition` từ `qc-requests.ts`) — import ngược sẽ tạo vòng
// lặp module thật (`qc-requests.ts` đã import `qcInspectionLevelEnum` từ file này).
export const qualityDispositionEnum = pgEnum('quality_disposition', [
  'CONCESSION',
  'SORT',
  'RETURN',
  'ACCEPT',
  'REWORK',
  'SCRAP',
]);
