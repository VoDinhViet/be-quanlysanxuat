import { ClientType } from '../../../database/schemas';
import {
  EmailField,
  EnumField,
  StringField,
  StringFieldOptional,
} from '../../../decorators/field.decorators';

export class CreateClientReqDto {
  @StringField({ maxLength: 255 })
  fullName!: string;

  @EmailField({ description: 'Email address' })
  email!: string;

  @StringField({ maxLength: 30 })
  phoneNumber!: string;

  @EnumField(() => ClientType)
  clientType!: ClientType;

  @StringFieldOptional({ maxLength: 50 })
  taxCode?: string;

  @StringFieldOptional({ maxLength: 255 })
  companyName?: string;

  @StringFieldOptional()
  address?: string;
}
