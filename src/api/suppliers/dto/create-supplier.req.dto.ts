import {
  EmailFieldOptional,
  StringField,
  StringFieldOptional,
} from '../../../decorators/field.decorators';

export class CreateSupplierReqDto {
  @StringField({ maxLength: 255 })
  name!: string;

  @EmailFieldOptional({ description: 'Email address' })
  email?: string;

  @StringFieldOptional({ maxLength: 30 })
  phoneNumber?: string;

  @StringFieldOptional()
  address?: string;
}
