import { FileKind, UploadType } from '../../database/schemas';
import { uploadPolicies } from './upload-policy';

describe('uploadPolicies', () => {
  // `Record<UploadType, ...>` already forces this at compile time, but the enum and the pgEnum in
  // `schemas/files.ts` are two separate lists — this fails loudly if someone adds a type to one.
  it('covers every UploadType', () => {
    const covered = Object.keys(uploadPolicies).sort();
    expect(covered).toEqual(Object.values(UploadType).sort());
  });

  it('maps every type to a real FileKind', () => {
    for (const [type, policy] of Object.entries(uploadPolicies)) {
      expect(Object.values(FileKind)).toContain(policy.kind);
      expect(policy.kind).toBeDefined();
      expect(type).toBeTruthy();
    }
  });

  it('treats documents as the only non-image type today', () => {
    expect(uploadPolicies[UploadType.MATERIAL_DOCUMENT].kind).toBe(
      FileKind.DOCUMENT,
    );
    expect(uploadPolicies[UploadType.USER_AVATAR].kind).toBe(FileKind.IMAGE);
    expect(uploadPolicies[UploadType.MATERIAL_IMAGE].kind).toBe(FileKind.IMAGE);
    expect(uploadPolicies[UploadType.PRODUCT_IMAGE].kind).toBe(FileKind.IMAGE);
  });
});
