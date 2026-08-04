import { PickType } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';

import { PurchaseRequestResDto } from './purchase-request.res.dto';

@Exclude()
export class PurchaseRequestRefResDto extends PickType(PurchaseRequestResDto, [
  'id',
  'code',
] as const) {}
