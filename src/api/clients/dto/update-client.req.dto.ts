import { ClientType } from '../../../database/schemas';
import {
  EmailFieldOptional,
  EnumFieldOptional,
  StringFieldOptional,
} from '../../../decorators/field.decorators';

export class UpdateClientReqDto {
  @StringFieldOptional({ maxLength: 255 })
  fullName?: string;

  @EmailFieldOptional({ description: 'Email address' })
  email?: string;

  @StringFieldOptional({ maxLength: 30 })
  phoneNumber?: string;

  @EnumFieldOptional(() => ClientType)
  clientType?: ClientType;

  @StringFieldOptional({ nullable: true, maxLength: 50 })
  taxCode?: string | null;

  @StringFieldOptional({ nullable: true, maxLength: 255 })
  companyName?: string | null;

  @StringFieldOptional({ nullable: true })
  address?: string | null;
}
