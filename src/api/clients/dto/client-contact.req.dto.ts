import {
  BooleanFieldOptional,
  EmailFieldOptional,
  StringField,
  StringFieldOptional,
} from '../../../decorators/field.decorators';

export class ClientContactReqDto {
  @StringField({ description: 'Contact full name', maxLength: 255 })
  name!: string;

  @StringFieldOptional({ description: 'Position/title', nullable: true, maxLength: 255 })
  position?: string | null;

  @StringFieldOptional({ description: 'Phone number', nullable: true, maxLength: 30 })
  phoneNumber?: string | null;

  @EmailFieldOptional({ description: 'Email', nullable: true })
  email?: string | null;

  @StringFieldOptional({ description: 'Note', nullable: true, maxLength: 500 })
  note?: string | null;

  @BooleanFieldOptional({ description: 'Mark as the primary contact' })
  isPrimary?: boolean;
}
