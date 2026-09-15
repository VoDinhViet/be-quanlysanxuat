import {
  BooleanFieldOptional,
  StringField,
  StringFieldOptional,
} from '../../../decorators/field.decorators';

export class CreateDepartmentReqDto {
  @StringField({ maxLength: 50, description: 'Department code' })
  code!: string;

  @StringField({ maxLength: 255, description: 'Department name' })
  name!: string;

  @StringFieldOptional({ maxLength: 500, description: 'Department description' })
  description?: string;

  @BooleanFieldOptional({ description: 'Active status' })
  isActive?: boolean;
}
