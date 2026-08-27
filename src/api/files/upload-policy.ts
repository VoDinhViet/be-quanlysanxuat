import { FileKind, UploadType } from '../../database/schemas';

/**
 * Per-`UploadType` rules applied by `FilesService.upload`.
 *
 * `kind` is what makes this worth having today: it is what picks the allowed MIME allowlist and the
 * size cap, and it is derived here rather than sent by the client — a caller asking for
 * `USER_AVATAR` cannot smuggle a PDF through by also claiming `kind: DOCUMENT`.
 */
type UploadPolicy = {
  kind: FileKind;
};

/**
 * NOTE — uploads are currently **not** permission-checked: any authenticated user may upload any
 * type. That is a deliberate choice to keep the flow simple, not an oversight.
 *
 * Rules:
 * - There is intentionally no empty `permissions` field here. A registry that *looks* like it
 *   gates access while gating nothing is worse than one that plainly doesn't — the next reader
 *   would assume they are protected.
 * - To turn enforcement on: add the field, add a guard reading `?type=`, and use OR semantics.
 */
export const uploadPolicies: Record<UploadType, UploadPolicy> = {
  [UploadType.USER_AVATAR]: { kind: FileKind.IMAGE },
  [UploadType.MATERIAL_IMAGE]: { kind: FileKind.IMAGE },
  [UploadType.MATERIAL_DOCUMENT]: { kind: FileKind.DOCUMENT },
  [UploadType.PRODUCT_IMAGE]: { kind: FileKind.IMAGE },
  [UploadType.PRODUCT_DOCUMENT]: { kind: FileKind.DOCUMENT },
  [UploadType.SUPPLIER_LOGO]: { kind: FileKind.IMAGE },
  [UploadType.SUPPLIER_DOCUMENT]: { kind: FileKind.DOCUMENT },
  [UploadType.BOM_ITEM_DRAWING]: { kind: FileKind.DOCUMENT },
  [UploadType.ORDER_DOCUMENT]: { kind: FileKind.DOCUMENT },
  [UploadType.IQC_EVIDENCE]: { kind: FileKind.EVIDENCE },
  [UploadType.IQC_DISPOSITION_EVIDENCE]: { kind: FileKind.EVIDENCE },
  [UploadType.OQC_EVIDENCE]: { kind: FileKind.EVIDENCE },
  [UploadType.OQC_DISPOSITION_EVIDENCE]: { kind: FileKind.EVIDENCE },
  // Chỉ nhận ảnh (khác OQC_EVIDENCE nhận cả tài liệu) — form "Thực hiện sản xuất" chỉ có dropzone
  // ảnh, không có ô tài liệu.
  [UploadType.PRODUCTION_OPERATION_EVIDENCE]: { kind: FileKind.IMAGE },
  // Ảnh + tài liệu — "xuất trả" gần với bàn giao chứng từ vật lý hơn ảnh báo cáo xưởng, cùng lý do
  // OQC_EVIDENCE/IQC_DISPOSITION_EVIDENCE nhận cả hai.
  [UploadType.SUPPLIER_RETURN_EVIDENCE]: { kind: FileKind.EVIDENCE },
  [UploadType.ITEM_DOCUMENT]: { kind: FileKind.DOCUMENT },
};
