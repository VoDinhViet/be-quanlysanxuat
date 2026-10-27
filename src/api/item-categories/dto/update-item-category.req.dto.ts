import { StringFieldOptional } from '../../../decorators/field.decorators';

export class UpdateItemCategoryReqDto {
  @StringFieldOptional({
    maxLength: 50,
    trim: true,
    description: 'Category code',
  })
  code?: string;

  @StringFieldOptional({
    maxLength: 255,
    trim: true,
    description: 'Category name',
  })
  name?: string;

  @StringFieldOptional({ maxLength: 500, nullable: true })
  description?: string | null;
}
