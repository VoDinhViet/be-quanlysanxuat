import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';

import { FileSelect } from '../../../database/schemas';
import { StringField } from '../../../decorators/field.decorators';

/** Đặt ở đây, không phải `file.field.ts` (nơi đó import `FileResDto`) — `FileResDto` sẽ import
 * `FileUrlField` từ đây, import ngược lại sẽ tạo vòng lặp. `toClassOnly` bắt buộc: cùng lý do
 * `FileField` (`file.field.ts`) — `ClassSerializerInterceptor` serialize DTO thêm một lần, lúc đó
 * `obj` là instance `FileResDto` (không có `storageKey`) nên transform không giới hạn sẽ ghi đè
 * `url` đã resolve thành null. */
export function FileUrlField(): PropertyDecorator {
  return applyDecorators(
    Transform(
      ({ obj }: { obj: FileSelect }) =>
        obj.storageKey ? `/${obj.storageKey}` : null,
      { toClassOnly: true },
    ),
    StringField({
      description:
        'Public, permanent static file URL, e.g. /2026/07/20/<uuid>.png — usable directly as an ' +
        '<img src>. Served by ServeStaticModule, not the API.',
    }),
  );
}
