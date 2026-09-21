import {
  BooleanFieldOptional,
  StringFieldOptional,
} from '../../../decorators/field.decorators';

export class UpdateDepartmentReqDto {
  @StringFieldOptional({ maxLength: 50, description: 'Department code' })
  code?: string;

  @StringFieldOptional({ maxLength: 255, description: 'Department name' })
  name?: string;

  @StringFieldOptional({
    maxLength: 500,
    description: 'Department description',
  })
  description?: string;

  @BooleanFieldOptional({ description: 'Active status' })
  isActive?: boolean;
}
