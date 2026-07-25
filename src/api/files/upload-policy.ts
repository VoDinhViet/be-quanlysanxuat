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
 * There is intentionally no empty `permissions` field here. A registry that *looks* like it gates
 * access while gating nothing is worse than one that plainly doesn't: the next reader would assume
 * they are protected. To turn enforcement on: add the field, add a guard reading `?type=`, and use
 * OR semantics.
 */
export const UPLOAD_POLICIES: Record<UploadType, UploadPolicy> = {
  [UploadType.USER_AVATAR]: { kind: FileKind.IMAGE },
  [UploadType.MATERIAL_IMAGE]: { kind: FileKind.IMAGE },
  [UploadType.MATERIAL_DOCUMENT]: { kind: FileKind.DOCUMENT },
  [UploadType.PRODUCT_IMAGE]: { kind: FileKind.IMAGE },
  [UploadType.PRODUCT_DOCUMENT]: { kind: FileKind.DOCUMENT },
  [UploadType.SUPPLIER_LOGO]: { kind: FileKind.IMAGE },
  [UploadType.SUPPLIER_DOCUMENT]: { kind: FileKind.DOCUMENT },
  [UploadType.BOM_ITEM_DRAWING]: { kind: FileKind.DOCUMENT },
};
