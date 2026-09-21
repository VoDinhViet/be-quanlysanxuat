import { StringField } from '../../../decorators/field.decorators';

export class CreateUnitReqDto {
  @StringField({ maxLength: 100, description: 'Unit name, e.g. Cái' })
  name!: string;
}
