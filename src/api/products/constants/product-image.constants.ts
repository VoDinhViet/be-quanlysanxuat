import { join } from 'node:path';

export const PRODUCT_IMAGE_FIELD_NAME = 'image';
export const PRODUCT_IMAGE_PUBLIC_DIR = 'uploads/products';
export const PRODUCT_IMAGE_UPLOAD_DIR = join(process.cwd(), PRODUCT_IMAGE_PUBLIC_DIR);
export const MAX_PRODUCT_IMAGE_SIZE_IN_BYTES = 5 * 1024 * 1024;
export const PRODUCT_IMAGE_ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;
