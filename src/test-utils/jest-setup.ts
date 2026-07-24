/**
 * Env defaults for unit tests.
 *
 * Some config factories are evaluated at *module load* (e.g. `api/files/config/multer.config.ts`
 * calls `uploadConfig()` directly to build Multer options once), and they run `validateConfig`.
 * `UPLOAD_URL_SECRET` is deliberately required — a missing one means download URLs could be forged
 * — so without a value here, merely importing a controller that touches Multer throws before any
 * test runs. Supplying a dummy keeps that guarantee in production while letting tests import freely.
 */
process.env.UPLOAD_URL_SECRET ??=
  'test-only-upload-url-secret-at-least-32-chars';
