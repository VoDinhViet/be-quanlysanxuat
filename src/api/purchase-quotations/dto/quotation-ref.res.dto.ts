import { PickType } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';

import { QuotationResDto } from './quotation.res.dto';

@Exclude()
export class QuotationRefResDto extends PickType(QuotationResDto, [
  'id',
  'code',
] as const) {}
