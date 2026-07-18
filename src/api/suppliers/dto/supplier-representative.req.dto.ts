import {
  BooleanFieldOptional,
  StringField,
  StringFieldOptional,
} from '../../../decorators/field.decorators';

export class SupplierRepresentativeReqDto {
  @StringField({ description: 'Representative full name', maxLength: 255 })
  name!: string;

  @StringFieldOptional({
    description: 'Representative phone number',
    nullable: true,
    maxLength: 30,
  })
  phoneNumber?: string | null;

  @BooleanFieldOptional({ description: 'Mark as the primary representative' })
  isPrimary?: boolean;
}
