import { FileKind, UploadType } from '../../database/schemas';
import { UPLOAD_POLICIES } from './upload-policy';

describe('UPLOAD_POLICIES', () => {
  // `Record<UploadType, ...>` already forces this at compile time, but the enum and the pgEnum in
  // `schemas/files.ts` are two separate lists — this fails loudly if someone adds a type to one.
  it('covers every UploadType', () => {
    const covered = Object.keys(UPLOAD_POLICIES).sort();
    expect(covered).toEqual(Object.values(UploadType).sort());
  });

  it('maps every type to a real FileKind', () => {
    for (const [type, policy] of Object.entries(UPLOAD_POLICIES)) {
      expect(Object.values(FileKind)).toContain(policy.kind);
      expect(policy.kind).toBeDefined();
      expect(type).toBeTruthy();
    }
  });

  it('treats documents as the only non-image type today', () => {
    expect(UPLOAD_POLICIES[UploadType.MATERIAL_DOCUMENT].kind).toBe(
      FileKind.DOCUMENT,
    );
    expect(UPLOAD_POLICIES[UploadType.USER_AVATAR].kind).toBe(FileKind.IMAGE);
    expect(UPLOAD_POLICIES[UploadType.MATERIAL_IMAGE].kind).toBe(
      FileKind.IMAGE,
    );
    expect(UPLOAD_POLICIES[UploadType.PRODUCT_IMAGE].kind).toBe(FileKind.IMAGE);
  });
});
