import { StringField } from '../../../decorators/field.decorators';

export class CreateUnitReqDto {
  @StringField({ maxLength: 50, description: 'Unit code, e.g. CAI' })
  code!: string;

  @StringField({ maxLength: 100, description: 'Unit name, e.g. Cái' })
  name!: string;
}
