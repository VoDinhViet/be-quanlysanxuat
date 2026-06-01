import { join } from 'node:path';

export const ORDER_FILE_FIELD_NAME = 'file';
export const ORDER_PDF_PUBLIC_DIR = 'uploads/orders/pdfs';
export const ORDER_PDF_UPLOAD_DIR = join(process.cwd(), ORDER_PDF_PUBLIC_DIR);
export const MAX_ORDER_PDF_SIZE_IN_BYTES = 10 * 1024 * 1024;
export const ORDER_PDF_ALLOWED_MIME_TYPE = 'application/pdf';
