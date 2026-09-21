import { PickType } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';

import { IqcResDto } from './iqc.res.dto';

@Exclude()
export class IqcRefResDto extends PickType(IqcResDto, [
  'id',
  'code',
] as const) {}
