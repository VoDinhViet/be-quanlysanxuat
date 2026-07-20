import { registerAs } from '@nestjs/config';
import { IsEnum, IsInt, IsOptional, IsString, MinLength, Min } from 'class-validator';
import { join } from 'path';

import { StorageDriver, UploadConfig } from './upload-config.type';
import validateConfig from '../utils/validate-config';

class EnvironmentVariablesValidator {
  @IsEnum(StorageDriver)
  @IsOptional()
  UPLOAD_DRIVER?: StorageDriver;

  @IsString()
  @IsOptional()
  UPLOAD_DIR?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  UPLOAD_MAX_IMAGE_SIZE?: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  UPLOAD_MAX_DOCUMENT_SIZE?: number;

  // Deliberately NOT @IsOptional(), unlike every other key here. File bytes are reachable only
  // through a URL signed with this secret, so a missing or guessable value means anyone can mint a
  // valid download link — i.e. the access control does nothing. Fail at boot instead.
  @IsString()
  @MinLength(32)
  UPLOAD_URL_SECRET!: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  UPLOAD_URL_TTL?: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  UPLOAD_ORPHAN_TTL?: number;
}

export default registerAs<UploadConfig>('upload', () => {
  validateConfig(process.env, EnvironmentVariablesValidator);

  return {
    driver: (process.env.UPLOAD_DRIVER as StorageDriver) || StorageDriver.LOCAL,
    dir: process.env.UPLOAD_DIR || join(process.cwd(), 'uploads'),
    maxImageSize: process.env.UPLOAD_MAX_IMAGE_SIZE
      ? parseInt(process.env.UPLOAD_MAX_IMAGE_SIZE, 10)
      : 5 * 1024 * 1024,
    maxDocumentSize: process.env.UPLOAD_MAX_DOCUMENT_SIZE
      ? parseInt(process.env.UPLOAD_MAX_DOCUMENT_SIZE, 10)
      : 10 * 1024 * 1024,
    urlSecret: process.env.UPLOAD_URL_SECRET as string,
    urlTtl: process.env.UPLOAD_URL_TTL ? parseInt(process.env.UPLOAD_URL_TTL, 10) : 3600,
    // Must comfortably outlast the longest a user might sit on a half-filled form with an image
    // already uploaded — sweeping too eagerly deletes a file the form is about to reference.
    orphanTtl: process.env.UPLOAD_ORPHAN_TTL
      ? parseInt(process.env.UPLOAD_ORPHAN_TTL, 10)
      : 24 * 60 * 60,
  };
});
