import { StringFieldOptional } from '../../../decorators/field.decorators';

/** `code` is omitted — a group's code is a stable identifier, not editable after creation. */
export class UpdateMaterialGroupReqDto {
  @StringFieldOptional({ maxLength: 255, description: 'Group name' })
  readonly name?: string;

  @StringFieldOptional({ maxLength: 500, nullable: true })
  readonly description?: string | null;
}
