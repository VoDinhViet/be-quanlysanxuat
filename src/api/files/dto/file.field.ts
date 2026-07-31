import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';

import { ClassFieldOptional } from '../../../decorators/field.decorators';
import { FileResDto } from './file.res.dto';
import { toFileResDto } from './to-file-res.dto.util';

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
