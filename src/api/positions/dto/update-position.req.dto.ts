import {
  StringFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

export class UpdatePositionReqDto {
  @UUIDFieldOptional({ description: 'Department this position belongs to' })
  departmentId?: string;

  @StringFieldOptional({ maxLength: 50, description: 'Position code' })
  code?: string;

  @StringFieldOptional({ maxLength: 255, description: 'Position name' })
  name?: string;

  @StringFieldOptional({ maxLength: 500, description: 'Position description' })
  description?: string;
}
