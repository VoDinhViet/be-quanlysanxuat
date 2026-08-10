import { PickType } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';

import { ItemResDto } from './item.res.dto';

@Exclude()
export class ItemUnitRefResDto extends PickType(ItemResDto, [
  'id',
  'code',
  'name',
  'unit',
] as const) {}
