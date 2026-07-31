import { plainToInstance } from 'class-transformer';

import { FileResDto } from './file.res.dto';

/** Bắt buộc vì property có `@Transform` riêng sẽ bỏ qua `@Type(() => FileResDto)` — trả thẳng row
 * Drizzle sẽ thiếu `url` đã ký (ảnh 404 âm thầm) và lộ `storageKey`/`checksum`/`uploadedBy`.
 * Property dạng `attachments` không cần hàm này vì không có `@Transform` riêng, `@Type` tự convert. */
export function toFileResDto(relation: unknown): FileResDto | null {
  if (!relation) {
    return null;
  }

  return plainToInstance(FileResDto, relation, {
    excludeExtraneousValues: true,
  });
}
