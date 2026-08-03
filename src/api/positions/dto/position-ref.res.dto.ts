import { PickType } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';

import { PositionResDto } from './position.res.dto';

@Exclude()
export class PositionRefResDto extends PickType(PositionResDto, [
  'id',
  'code',
  'name',
] as const) {}
