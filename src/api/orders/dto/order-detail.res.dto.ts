import { Exclude, Expose } from 'class-transformer';

import { ClassFieldOptional } from '../../../decorators/field.decorators';
import { OrderAttachmentResDto } from './order-attachment.res.dto';
import { OrderItemResDto } from './order-item.res.dto';
import { OrderResDto } from './order.res.dto';

@Exclude()
export class OrderDetailResDto extends OrderResDto {
  @Expose()
  @ClassFieldOptional(() => OrderItemResDto, { each: true })
  items!: OrderItemResDto[];

  @Expose()
  @ClassFieldOptional(() => OrderAttachmentResDto, { each: true })
  attachments!: OrderAttachmentResDto[];
}
