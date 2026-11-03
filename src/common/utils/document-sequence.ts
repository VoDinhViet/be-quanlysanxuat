import { sql } from 'drizzle-orm';
import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core';

import type { DbTransaction } from '../../database/database.type';
import {
  inventoryAdjustments,
  inventoryIssues,
  inventoryReceipts,
  inventoryRequisitions,
  items,
  ncrs,
  orders,
  outboundOrders,
  outsourcingOrders,
  outsourcingReceipts,
  paymentRequests,
  productionOrders,
  purchaseOrders,
  purchaseQuotations,
  purchaseRequests,
  qualityInspections,
  supplierReturns,
  users,
} from '../../database/schemas';

export enum DocumentType {
  ITEM_FG = 'ITEM_FG',
  PURCHASE_REQUEST = 'PURCHASE_REQUEST',
  OQC = 'OQC',
  IQC = 'IQC',
  NCR = 'NCR',
  INVENTORY_RECEIPT = 'INVENTORY_RECEIPT',
  INVENTORY_ISSUE = 'INVENTORY_ISSUE',
  INVENTORY_ADJUSTMENT = 'INVENTORY_ADJUSTMENT',
  INVENTORY_REQUISITION = 'INVENTORY_REQUISITION',
  PURCHASE_QUOTATION = 'PURCHASE_QUOTATION',
  PURCHASE_ORDER = 'PURCHASE_ORDER',
  OUTSOURCING_ORDER = 'OUTSOURCING_ORDER',
  OUTSOURCING_RECEIPT = 'OUTSOURCING_RECEIPT',
  USER = 'USER',
  ORDER = 'ORDER',
  PRODUCTION_ORDER = 'PRODUCTION_ORDER',
  OUTBOUND_ORDER = 'OUTBOUND_ORDER',
  SUPPLIER_RETURN = 'SUPPLIER_RETURN',
  PAYMENT_REQUEST = 'PAYMENT_REQUEST',
}

interface DocumentCodeSource {
  table: PgTable;
  column: AnyPgColumn;
  prefix: (year: number) => string;
}

/** `prefix` phải khớp khuôn mã ở nơi gọi: lệch thì `MAX` không thấy mã cũ và cấp lại từ 1. Chỉ gồm
 * chữ, số và `-` vì được ghép thẳng vào regex. */
const DOCUMENT_CODE_SOURCES: Record<DocumentType, DocumentCodeSource> = {
  [DocumentType.ITEM_FG]: {
    table: items,
    column: items.code,
    prefix: () => 'SP',
  },
  [DocumentType.PURCHASE_REQUEST]: {
    table: purchaseRequests,
    column: purchaseRequests.code,
    prefix: () => 'PR-',
  },
  [DocumentType.OQC]: {
    table: qualityInspections,
    column: qualityInspections.inspectionNo,
    prefix: (year) => `OQC-${year}-`,
  },
  [DocumentType.IQC]: {
    table: qualityInspections,
    column: qualityInspections.inspectionNo,
    prefix: (year) => `IQC-${year}-`,
  },
  [DocumentType.NCR]: {
    table: ncrs,
    column: ncrs.code,
    prefix: (year) => `NCR-${year}-`,
  },
  [DocumentType.INVENTORY_RECEIPT]: {
    table: inventoryReceipts,
    column: inventoryReceipts.code,
    prefix: (year) => `PNK-${year}-`,
  },
  [DocumentType.INVENTORY_ISSUE]: {
    table: inventoryIssues,
    column: inventoryIssues.code,
    prefix: (year) => `PXK-${year}-`,
  },
  [DocumentType.INVENTORY_ADJUSTMENT]: {
    table: inventoryAdjustments,
    column: inventoryAdjustments.code,
    prefix: (year) => `PDC-${year}-`,
  },
  [DocumentType.INVENTORY_REQUISITION]: {
    table: inventoryRequisitions,
    column: inventoryRequisitions.code,
    prefix: (year) => `MR-${year}-`,
  },
  [DocumentType.PURCHASE_QUOTATION]: {
    table: purchaseQuotations,
    column: purchaseQuotations.code,
    prefix: () => 'RFQ-',
  },
  [DocumentType.PURCHASE_ORDER]: {
    table: purchaseOrders,
    column: purchaseOrders.code,
    prefix: () => 'DMH-',
  },
  [DocumentType.OUTSOURCING_ORDER]: {
    table: outsourcingOrders,
    column: outsourcingOrders.code,
    prefix: () => 'OS-OUT-',
  },
  [DocumentType.OUTSOURCING_RECEIPT]: {
    table: outsourcingReceipts,
    column: outsourcingReceipts.code,
    prefix: () => 'OS-IN-',
  },
  [DocumentType.USER]: {
    table: users,
    column: users.code,
    prefix: () => 'NV',
  },
  [DocumentType.ORDER]: {
    table: orders,
    column: orders.code,
    prefix: () => 'SO',
  },
  [DocumentType.PRODUCTION_ORDER]: {
    table: productionOrders,
    column: productionOrders.code,
    prefix: () => 'LSX',
  },
  // `year` ở đây là `yyMMdd`: mỗi ngày một dãy số (xem `generateOutboundOrderCode`).
  [DocumentType.OUTBOUND_ORDER]: {
    table: outboundOrders,
    column: outboundOrders.code,
    prefix: (dayKey) => `DO-${dayKey}-`,
  },
  [DocumentType.SUPPLIER_RETURN]: {
    table: supplierReturns,
    column: supplierReturns.code,
    prefix: (year) => `PTNCC-${year}-`,
  },
  [DocumentType.PAYMENT_REQUEST]: {
    table: paymentRequests,
    column: paymentRequests.code,
    prefix: () => 'YCTT-',
  },
};

/**
 * Cấp `quantity` số liên tiếp, tính từ mã lớn nhất đang có trong chính bảng chứng từ. Không lưu bộ
 * đếm riêng vì bộ đếm có thể lệch khỏi dữ liệu và làm mọi lượt tạo sau đó đụng unique.
 *
 * Rules:
 * - Gọi trong transaction đang mở của lượt tạo chứng từ: advisory lock giữ tới hết transaction nên
 *   hai request cùng tiền tố đợi nhau. Transaction phải ở READ COMMITTED (mặc định) để câu `MAX`
 *   sau khi lấy khoá thấy số vừa commit.
 * - `insert` xong mới được sinh tiếp cùng tiền tố trong cùng transaction, vì `MAX` không thấy số
 *   chưa ghi. Cần nhiều số trước khi insert thì truyền `quantity`.
 * - Xoá cứng phiếu cuối dãy thì số đó được cấp lại; dòng xoá mềm vẫn được tính.
 * - `[0-9]{1,9}` để mã nhập tay quá dài không làm tràn `int`.
 */
export async function generateDocumentSequences(
  tx: DbTransaction,
  documentType: DocumentType,
  year: number,
  quantity: number,
): Promise<number[]> {
  const { table, column, prefix } = DOCUMENT_CODE_SOURCES[documentType];
  const codePrefix = prefix(year);

  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${codePrefix}))`);

  const codePattern = `^${codePrefix}([0-9]{1,9})$`;
  const [{ lastNumber }] = await tx
    .select({
      lastNumber:
        sql`coalesce(max(substring(${column} from ${codePattern}::text)::int), 0)`.mapWith(
          Number,
        ),
    })
    .from(table);

  return Array.from({ length: quantity }, (_, index) => lastNumber + index + 1);
}

/** Cấp một số. Cùng ràng buộc với `generateDocumentSequences`. */
export async function generateDocumentSequence(
  tx: DbTransaction,
  documentType: DocumentType,
  year = 0,
): Promise<number> {
  const [sequence] = await generateDocumentSequences(tx, documentType, year, 1);

  return sequence;
}
