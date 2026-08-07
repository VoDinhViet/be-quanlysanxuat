import { PickType } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';

import { ItemResDto } from './item.res.dto';

@Exclude()
export class ItemOptionResDto extends PickType(ItemResDto, [
  'id',
  'code',
  'name',
] as const) {}
