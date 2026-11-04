import { createHash, timingSafeEqual } from 'crypto';

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

/**
 * So hai chuỗi bí mật qua SHA-256 để độ dài bằng nhau: `timingSafeEqual` không rò thời gian theo
 * nội dung, kể cả khi độ dài đầu vào khác nhau.
 */
export function secureCompare(provided: string, expected: string): boolean {
  return timingSafeEqual(digest(provided), digest(expected));
}
