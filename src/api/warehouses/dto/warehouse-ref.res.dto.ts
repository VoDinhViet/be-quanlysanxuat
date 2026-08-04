import { PickType } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';

import { WarehouseResDto } from './warehouse.res.dto';

@Exclude()
export class WarehouseRefResDto extends PickType(WarehouseResDto, [
  'id',
  'code',
  'name',
] as const) {}
