import {
  StringField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';

export class CreatePositionReqDto {
  @UUIDField({ description: 'Department this position belongs to' })
  departmentId!: string;

  @StringField({ maxLength: 50, description: 'Position code' })
  code!: string;

  @StringField({ maxLength: 255, description: 'Position name' })
  name!: string;

  @StringFieldOptional({ maxLength: 500, description: 'Position description' })
  description?: string;
}
