import { PickType } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';

import { SupplierResDto } from '../../suppliers/dto/supplier.res.dto';

@Exclude()
export class PaymentRequestSupplierRefResDto extends PickType(SupplierResDto, [
  'id',
  'code',
  'name',
  'address',
  'phoneNumber',
  'email',
] as const) {}
