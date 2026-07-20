import { plainToInstance } from 'class-transformer';

import { FileResDto } from './file.res.dto';

/**
 * Materialises a drizzle `files` relation row (`imageFile` / `logoFile` / `avatarFile`) into a
 * `FileResDto`, for the entity DTOs that rename the relation with a custom `@Transform`.
 *
 * Building the DTO here is not optional politeness — a property carrying a custom `@Transform`
 * **skips its own `@Type(() => FileResDto)`**: class-transformer takes the transform's return
 * value verbatim and never runs the nested conversion. Returning the raw drizzle row therefore
 * did two bad things at once: it omitted the signed `url` that every client renders (so images
 * silently 404), and it leaked `storageKey`, `checksum` and `uploadedBy` to the API.
 *
 * `attachments`-style properties don't need this — their relation key already matches the DTO
 * property, so they carry no `@Transform` and `@Type` converts them normally.
 */
export function toFileResDto(relation: unknown): FileResDto | null {
  if (!relation) {
    return null;
  }

  return plainToInstance(FileResDto, relation, { excludeExtraneousValues: true });
}
