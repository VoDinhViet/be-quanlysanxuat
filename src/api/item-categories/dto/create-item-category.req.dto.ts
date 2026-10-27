import {
  StringField,
  StringFieldOptional,
} from '../../../decorators/field.decorators';

export class CreateItemCategoryReqDto {
  @StringField({
    maxLength: 50,
    trim: true,
    description: 'Category code, e.g. BULONG',
  })
  code!: string;

  @StringField({
    maxLength: 255,
    trim: true,
    description: 'Category name, e.g. Bulong',
  })
  name!: string;

  @StringFieldOptional({ maxLength: 500 })
  description?: string;
}
