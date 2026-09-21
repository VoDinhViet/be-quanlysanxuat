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

  @StringFieldOptional({
    nullable: true,
    maxLength: 500,
    description: 'Địa chỉ giao hàng',
  })
  readonly deliveryAddress?: string | null;

  @StringFieldOptional({
    nullable: true,
    maxLength: 255,
    description: 'Người nhận',
  })
  readonly receiverName?: string | null;

  @StringFieldOptional({
    nullable: true,
    maxLength: 30,
    description: 'Điện thoại người nhận',
  })
  readonly receiverPhone?: string | null;

  @StringFieldOptional({
    nullable: true,
    maxLength: 255,
    description: 'Phương tiện',
  })
  readonly vehicle?: string | null;

  @ClassField(() => OutboundOrderItemReqDto, { each: true })
  readonly items!: OutboundOrderItemReqDto[];
}
