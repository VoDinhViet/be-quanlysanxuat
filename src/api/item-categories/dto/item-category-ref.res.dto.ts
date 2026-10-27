import { PickType } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';

import { ItemCategoryResDto } from './item-category.res.dto';

@Exclude()
export class ItemCategoryRefResDto extends PickType(ItemCategoryResDto, [
  'id',
  'code',
  'name',
] as const) {}
