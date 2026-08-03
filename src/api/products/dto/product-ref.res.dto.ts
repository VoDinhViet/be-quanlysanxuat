import { PickType } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';

import { ProductResDto } from './product.res.dto';

@Exclude()
export class ProductRefResDto extends PickType(ProductResDto, [
  'id',
  'code',
  'name',
] as const) {}
