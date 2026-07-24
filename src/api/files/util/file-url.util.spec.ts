import {
  buildSignedFileUrl,
  isExpired,
  isSignatureValid,
  secondsUntil,
} from './file-url.util';

describe('file-url.util', () => {
  const SECRET = 'a-test-secret-at-least-32-characters-long';
  const FILE_ID = '11111111-1111-1111-1111-111111111111';
  const OTHER_FILE_ID = '22222222-2222-2222-2222-222222222222';
  const NOW = 1_770_000_000_000; // fixed clock — Date.now() would make these flaky

  /** Pulls `exp`/`sig` back out of a generated URL so tests assert on what a client would send. */
  const parse = (url: string) => {
    const query = new URLSearchParams(url.split('?')[1]);
    return { exp: Number(query.get('exp')), sig: query.get('sig') as string };
  };

  describe('buildSignedFileUrl', () => {
    it('points at the unversioned download route with exp and sig', () => {
      const url = buildSignedFileUrl(FILE_ID, SECRET, 3600, NOW);

      expect(url).toMatch(
        new RegExp(`^/api/files/${FILE_ID}/download\\?exp=\\d+&sig=.+$`),
      );
    });

    it('sets exp to now + ttl in unix seconds', () => {
      const { exp } = parse(buildSignedFileUrl(FILE_ID, SECRET, 600, NOW));

      expect(exp).toBe(NOW / 1000 + 600);
    });
  });

  describe('isSignatureValid', () => {
    it('accepts a signature it just produced', () => {
      const { exp, sig } = parse(
        buildSignedFileUrl(FILE_ID, SECRET, 3600, NOW),
      );

      expect(isSignatureValid(FILE_ID, exp, sig, SECRET)).toBe(true);
    });

    it('rejects a tampered signature', () => {
      const { exp, sig } = parse(
        buildSignedFileUrl(FILE_ID, SECRET, 3600, NOW),
      );
      const tampered = `${sig.slice(0, -1)}${sig.at(-1) === 'A' ? 'B' : 'A'}`;

      expect(isSignatureValid(FILE_ID, exp, tampered, SECRET)).toBe(false);
    });

    it('rejects a pushed-out expiry, because exp is inside the signed payload', () => {
      const { exp, sig } = parse(
        buildSignedFileUrl(FILE_ID, SECRET, 3600, NOW),
      );

      expect(isSignatureValid(FILE_ID, exp + 86_400, sig, SECRET)).toBe(false);
    });

    it("rejects one file's signature replayed against another file", () => {
      const { exp, sig } = parse(
        buildSignedFileUrl(FILE_ID, SECRET, 3600, NOW),
      );

      expect(isSignatureValid(OTHER_FILE_ID, exp, sig, SECRET)).toBe(false);
    });

    it('rejects a signature minted with a different secret', () => {
      const { exp, sig } = parse(
        buildSignedFileUrl(FILE_ID, 'a-completely-different-secret', 3600, NOW),
      );

      expect(isSignatureValid(FILE_ID, exp, sig, SECRET)).toBe(false);
    });

    // `timingSafeEqual` throws when the buffers differ in length, so a short signature must be
    // caught by the length guard rather than blowing up as a 500.
    it('returns false instead of throwing on a wrong-length signature', () => {
      const { exp } = parse(buildSignedFileUrl(FILE_ID, SECRET, 3600, NOW));

      expect(() =>
        isSignatureValid(FILE_ID, exp, 'short', SECRET),
      ).not.toThrow();
      expect(isSignatureValid(FILE_ID, exp, 'short', SECRET)).toBe(false);
      expect(isSignatureValid(FILE_ID, exp, '', SECRET)).toBe(false);
    });
  });

  describe('isExpired', () => {
    it('is false before exp and true at or after it', () => {
      const exp = NOW / 1000 + 60;

      expect(isExpired(exp, NOW)).toBe(false);
      expect(isExpired(exp, NOW + 59_000)).toBe(false);
      expect(isExpired(exp, NOW + 60_000)).toBe(true);
      expect(isExpired(exp, NOW + 61_000)).toBe(true);
    });
  });

  describe('secondsUntil', () => {
    it('floors at zero once expired, so max-age is never negative', () => {
      const exp = NOW / 1000 + 60;

      expect(secondsUntil(exp, NOW)).toBe(60);
      expect(secondsUntil(exp, NOW + 120_000)).toBe(0);
    });
  });
});
