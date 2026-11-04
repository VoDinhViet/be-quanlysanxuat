import {
  DOCUMENT_CODE_MAX_LENGTH,
  DOCUMENT_CODE_PATTERN,
} from '../../common/summary/summary.constant';

/** Loại chứng từ ở mỗi bước truy vết, giá trị của trường `step`. */
export enum TraceStep {
  ORDER = 'order',
  PRODUCTION_ORDER = 'production_order',
  JOB = 'job',
  OPERATION = 'operation',
  OUTSOURCING_ORDER = 'outsourcing_order',
  PURCHASE_REQUEST = 'purchase_request',
  PURCHASE_ORDER = 'purchase_order',
  RECEIPT = 'receipt',
  IQC = 'iqc',
  OQC = 'oqc',
  SUPPLIER_RETURN = 'supplier_return',
  PAYMENT_REQUEST = 'payment_request',
  SUPPLIER = 'supplier',
  BOM = 'bom',
  ITEM = 'item',
  STOCK = 'stock',
}

// Mỗi bước tối đa ngần này dòng để một đơn lớn không làm tràn kết quả
export const TRACE_STEP_LIMIT = 50;

// Cây BOM lớn hơn các bước khác vì mỗi tầng là một dòng
export const BOM_TREE_LIMIT = 200;

export const TRACE_SUPPLIER_KEYWORD_MAX_LENGTH = 80;

// Cấu hình chung cho các tham số mã chứng từ/vật tư của route truy vết
export const TRACE_CODE_FIELD_OPTIONS = {
  pattern: DOCUMENT_CODE_PATTERN,
  patternMessage: 'Mã chỉ gồm chữ, số, . _ / -',
  maxLength: DOCUMENT_CODE_MAX_LENGTH,
};
