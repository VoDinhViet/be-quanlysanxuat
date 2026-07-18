import { StringField, StringFieldOptional } from '../../../decorators/field.decorators';

export class CreateMaterialGroupReqDto {
  @StringField({ maxLength: 50, description: 'Group code' })
  readonly code!: string;

  @StringField({ maxLength: 255, description: 'Group name' })
  readonly name!: string;

  @StringFieldOptional({ maxLength: 500, nullable: true })
  readonly description?: string | null;
}
