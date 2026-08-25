import { PickType } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';

import { UnitResDto } from './unit.res.dto';

@Exclude()
export class UnitRefResDto extends PickType(UnitResDto, [
  'id',
  'code',
  'name',
] as const) {}
