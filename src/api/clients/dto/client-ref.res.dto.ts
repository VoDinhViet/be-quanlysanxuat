import { PickType } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';

import { ClientResDto } from './client.res.dto';

@Exclude()
export class ClientRefResDto extends PickType(ClientResDto, [
  'id',
  'code',
  'name',
] as const) {}
