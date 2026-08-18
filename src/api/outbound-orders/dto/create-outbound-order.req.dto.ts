import { FulfillmentType } from '../../../database/schemas';
import {
  ClassField,
  DateField,
  EnumField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';
import { OutboundOrderItemReqDto } from './outbound-order-item.req.dto';

export class CreateOutboundOrderReqDto {
  @UUIDField({ description: 'Khách hàng — 1 phiếu chỉ giao cho 1 khách hàng' })
  readonly clientId!: string;

  @DateField({ description: 'Ngày giao' })
  readonly fulfillmentDate!: Date;

  @EnumField(() => FulfillmentType, { description: 'Hình thức giao' })
  readonly fulfillmentType!: FulfillmentType;

  @StringFieldOptional({
    nullable: true,
    maxLength: 500,
    description: 'Ghi chú',
  })
  readonly note?: string | null;

  @ClassField(() => OutboundOrderItemReqDto, { each: true })
  readonly items!: OutboundOrderItemReqDto[];
}
