import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';

import { ClassFieldOptional } from '../../../decorators/field.decorators';
import { FileResDto } from './file.res.dto';
import { toFileResDto } from './to-file-res.dto.util';

/**
 * Response-DTO field for a `files` relation whose column name (`avatarFile`, `logoFile`,
 * `imageFile`) differs from the exposed property (`avatar`, `logo`, `image`). Bundles the
 * rename+map `@Transform` (see `toFileResDto`) with the nullable `@ClassFieldOptional(() =>
 * FileResDto)` shape. Pair it with an explicit `@Expose()`, like every other response-DTO field.
 *
 * Rules:
 * - Lives here, not in `src/decorators/field.decorators.ts`, on purpose: `FileResDto` already
 *   imports from `field.decorators.ts`, so referencing it there would be a circular import.
 * - `toClassOnly`: the global ClassSerializerInterceptor serialises the DTO a second time, and on
 *   that pass `obj` is the DTO instance (which has no `<relationKey>`), so an unrestricted
 *   transform would overwrite the resolved file with null.
 */
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
