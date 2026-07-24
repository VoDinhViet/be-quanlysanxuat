import { ClientStatus } from '../../../database/schemas';
import {
  ClassFieldOptional,
  EmailFieldOptional,
  EnumFieldOptional,
  StringField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';
import { ClientContactReqDto } from './client-contact.req.dto';

export class CreateClientReqDto {
  @StringField({ description: 'Client name', maxLength: 255 })
  name!: string;

  @UUIDField({ description: 'Client group id (Nhóm KH)' })
  clientGroupId!: string;

  @StringFieldOptional({
    description: 'Client code; auto-generated if omitted',
    maxLength: 50,
  })
  code?: string;

  @StringFieldOptional({
    description: 'Tax code (Mã số thuế)',
    nullable: true,
    maxLength: 50,
  })
  taxCode?: string | null;

  @StringFieldOptional({
    description: 'Phone number',
    nullable: true,
    maxLength: 30,
  })
  phoneNumber?: string | null;

  @EmailFieldOptional({ description: 'Email', nullable: true })
  email?: string | null;

  @StringFieldOptional({
    description: 'Address',
    nullable: true,
    maxLength: 500,
  })
  address?: string | null;

  @StringFieldOptional({ description: 'Note', nullable: true, maxLength: 1000 })
  note?: string | null;

  @EnumFieldOptional(() => ClientStatus)
  status?: ClientStatus;

  @ClassFieldOptional(() => ClientContactReqDto, { each: true })
  contacts?: ClientContactReqDto[];
}
