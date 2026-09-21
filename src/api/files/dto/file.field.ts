import { applyDecorators } from '@nestjs/common';
import { plainToInstance, Transform } from 'class-transformer';

import { ClassFieldOptional } from '../../../decorators/field.decorators';
import { FileResDto } from './file.res.dto';

/** Bắt buộc vì property có `@Transform` riêng sẽ bỏ qua `@Type(() => FileResDto)` của
 * `ClassFieldOptional` bên dưới — trả thẳng row Drizzle sẽ thiếu `url` (ảnh 404 âm thầm) và lộ
 * `storageKey`/`checksum`/`uploadedBy`. `.select()`+`leftJoin` (khác relational query API) trả
 * object toàn NULL khi miss, không phải `null`/`undefined` — check `id` thay vì truthiness. */
function toFileResDto(relation: unknown): FileResDto | null {
  if (!(relation as { id?: unknown } | null | undefined)?.id) {
    return null;
  }

  return plainToInstance(FileResDto, relation, {
    excludeExtraneousValues: true,
  });
}

/** Đặt ở đây, không phải `field.decorators.ts`, vì `FileResDto` đã import từ đó — tránh vòng lặp
 * import. `toClassOnly` bắt buộc: `ClassSerializerInterceptor` serialize DTO thêm một lần, lúc đó
 * `obj` là instance DTO (không có `<relationKey>`) nên transform không giới hạn sẽ ghi đè file đã
 * resolve thành null. */
export function FileField(
  relationKey: string,
  description?: string,
): PropertyDecorator {
  return applyDecorators(
    Transform(
      ({ obj }: { obj: Record<string, unknown> }) =>
        toFileResDto(obj[relationKey]),
      {
        toClassOnly: true,
      },
    ),
    ClassFieldOptional(() => FileResDto, { nullable: true, description }),
  );
}
