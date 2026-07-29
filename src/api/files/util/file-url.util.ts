import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Signed download URLs.
 *
 * Rules:
 * - Why a signature instead of the bearer token every other route uses: a browser cannot attach
 *   an `Authorization` header to `<img src>`. Requiring a token would force the frontend to fetch
 *   every image as a blob and lose HTTP caching. The signature travels in the URL, so `src` just
 *   works.
 * - The trade-off is explicit: anyone holding the URL can read the file until it expires (the
 *   "anyone with the link" model). It stops outsiders enumerating storage; it does not stop a
 *   user deliberately forwarding a link.
 */

/**
 * Must match the global prefix set in `main.ts` (`setGlobalPrefix('api')`). No `/v1` — URI
 * versioning is enabled but no controller declares a version and there is no `defaultVersion`,
 * so routes register unversioned.
 */
const DOWNLOAD_PATH_PREFIX = '/api/files';

/** `exp` is part of the signed payload, so pushing the expiry out invalidates the signature. */
const buildSignature = (
  fileId: string,
  expiresAt: number,
  secret: string,
): string =>
  createHmac('sha256', secret)
    .update(`${fileId}:${expiresAt}`)
    .digest('base64url');

export function buildSignedFileUrl(
  fileId: string,
  secret: string,
  ttlSeconds: number,
  nowMs: number = Date.now(),
): string {
  const exp = Math.floor(nowMs / 1000) + ttlSeconds;
  const sig = buildSignature(fileId, exp, secret);

  return `${DOWNLOAD_PATH_PREFIX}/${fileId}/download?exp=${exp}&sig=${sig}`;
}

export function isSignatureValid(
  fileId: string,
  expiresAt: number,
  signature: string,
  secret: string,
): boolean {
  const expected = Buffer.from(buildSignature(fileId, expiresAt, secret));
  const received = Buffer.from(signature);

  // `timingSafeEqual` throws on a length mismatch, so the length check has to come first — and it
  // leaks nothing beyond the signature length, which is fixed by the algorithm anyway.
  return (
    expected.length === received.length && timingSafeEqual(expected, received)
  );
}

export const isExpired = (
  expiresAt: number,
  nowMs: number = Date.now(),
): boolean => expiresAt * 1000 <= nowMs;

/** Seconds left before `expiresAt`, floored at 0 — used for `Cache-Control: max-age`. */
export const secondsUntil = (
  expiresAt: number,
  nowMs: number = Date.now(),
): number => Math.max(0, expiresAt - Math.floor(nowMs / 1000));
