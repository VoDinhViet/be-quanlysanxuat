import { StringFieldOptional } from '../../../decorators/field.decorators';

export class UpdateUnitReqDto {
  @StringFieldOptional({ maxLength: 50, description: 'Unit code' })
  code?: string;

  @StringFieldOptional({ maxLength: 100, description: 'Unit name, e.g. Cái' })
  name?: string;
}
