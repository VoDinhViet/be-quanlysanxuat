import { join } from 'node:path';

export const PRODUCT_TECHNICAL_FILE_FIELD_NAME = 'file';
export const PRODUCT_TECHNICAL_FILE_PUBLIC_DIR = 'uploads/products/files';
export const PRODUCT_TECHNICAL_FILE_UPLOAD_DIR = join(
  process.cwd(),
  PRODUCT_TECHNICAL_FILE_PUBLIC_DIR,
);
export const MAX_PRODUCT_TECHNICAL_FILE_SIZE_IN_BYTES = 20 * 1024 * 1024;
export const PRODUCT_TECHNICAL_FILE_ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/vnd.dwg',
  'image/x-dwg',
  'image/vnd.dxf',
  'application/acad',
  'application/x-acad',
  'application/autocad_dwg',
  'application/dwg',
  'application/x-dwg',
  'application/dxf',
  'application/x-dxf',
  'drawing/x-dwg',
  'drawing/x-dxf',
] as const;
export const PRODUCT_TECHNICAL_FILE_ALLOWED_EXTENSIONS = [
  '.pdf',
  '.dwg',
  '.dxf',
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
] as const;
