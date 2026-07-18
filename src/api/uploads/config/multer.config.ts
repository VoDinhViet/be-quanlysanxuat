import { randomUUID } from 'crypto';
import { extname, join } from 'path';
import { mkdirSync } from 'fs';

import { HttpStatus } from '@nestjs/common';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { diskStorage } from 'multer';

import { ErrorCode } from '../../../constants/error-code.constant';
import { AppException } from '../../../exceptions/app.exception';

const UPLOAD_DIR = join(process.cwd(), 'uploads');
const IMAGE_MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const IMAGE_ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const DOCUMENT_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const DOCUMENT_ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

const storage = diskStorage({
  destination: (_req, _file, callback) => {
    mkdirSync(UPLOAD_DIR, { recursive: true });
    callback(null, UPLOAD_DIR);
  },
  filename: (_req, file, callback) => {
    callback(null, `${randomUUID()}${extname(file.originalname)}`);
  },
});

function buildFileFilter(allowedMimeTypes: string[]): MulterOptions['fileFilter'] {
  return (_req, file, callback) => {
    if (!allowedMimeTypes.includes(file.mimetype)) {
      callback(new AppException(ErrorCode.E016, HttpStatus.BAD_REQUEST), false);
      return;
    }
    callback(null, true);
  };
}

export const multerOptions: MulterOptions = {
  storage,
  limits: {
    fileSize: IMAGE_MAX_FILE_SIZE_BYTES,
  },
  fileFilter: buildFileFilter(IMAGE_ALLOWED_MIME_TYPES),
};

export const documentMulterOptions: MulterOptions = {
  storage,
  limits: {
    fileSize: DOCUMENT_MAX_FILE_SIZE_BYTES,
  },
  fileFilter: buildFileFilter(DOCUMENT_ALLOWED_MIME_TYPES),
};
