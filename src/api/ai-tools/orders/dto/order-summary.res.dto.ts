import { PickType } from '@nestjs/swagger';
import { Exclude, Expose, Type } from 'class-transformer';

import { ClientRefResDto } from '../../../clients/dto/client-ref.res.dto';
import { PageOrderResDto } from '../../../orders/dto/page-order.res.dto';

/** What the model sees for one order. `client` is narrowed to id/code/name: the full client in
 * `PageOrderResDto` also carries tax code, phone, email and address. */
@Exclude()
export class OrderSummaryResDto extends PickType(PageOrderResDto, [
  'code',
  'buyerPoNo',
  'dueDate',
  'status',
  'expired',
] as const) {
  @Expose()
  @Type(() => ClientRefResDto)
  client!: ClientRefResDto | null;
}
