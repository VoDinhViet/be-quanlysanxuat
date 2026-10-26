import { Exclude, Expose } from 'class-transformer';

import { ClassField } from '../../../decorators/field.decorators';
import { ClientRefResDto } from '../../clients/dto/client-ref.res.dto';
import { OutboundOrderRefResDto } from './outbound-order-ref.res.dto';

@Exclude()
export class OutboundOrderClientRefResDto extends OutboundOrderRefResDto {
  @Expose()
  @ClassField(() => ClientRefResDto)
  client!: ClientRefResDto;
}
