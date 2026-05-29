import { EmailFieldOptional, StringFieldOptional } from '../../../decorators/field.decorators';

export class UpdateSupplierReqDto {
  @StringFieldOptional({ maxLength: 255 })
  name?: string;

  @EmailFieldOptional({ description: 'Email address', nullable: true })
  email?: string | null;

  @StringFieldOptional({ nullable: true, maxLength: 30 })
  phoneNumber?: string | null;

  @StringFieldOptional({ nullable: true })
  address?: string | null;
}
