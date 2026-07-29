import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { memoryStorage } from 'multer';

import uploadConfig from '../../../config/upload.config';
import type { UploadConfig } from '../../../config/upload-config.type';

/**
 * Buffers the upload fully in memory instead of writing straight to disk — `FilesService` needs
 * the raw bytes to run magic-byte detection (`file-type`) and compute the checksum before handing
 * them to the `StorageProvider`, so nothing can be persisted to disk until validation passes. The
 * size cap here is only a coarse ceiling (Multer rejects early via `PayloadTooLargeException`,
 * mapped to `ErrorCode.E017`); the real per-category limit (image vs document) is enforced in
 * `FilesService.upload` once the `category` field is known.
 */
// `uploadConfig` is `registerAs`'s underlying factory, which runs synchronously — calling it
// directly (bypassing DI) is safe here since Multer options are built once at module-load time,
// before any request/injector context exists. Cast past `ConfigFactoryReturnValue`'s `T | Promise<T>`
// since this factory never actually returns a promise.
const { maxImageSize, maxDocumentSize } = uploadConfig() as UploadConfig;

export const multerOptions: MulterOptions = {
  storage: memoryStorage(),
  limits: {
    fileSize: Math.max(maxImageSize, maxDocumentSize),
  },
};
