import { FulfillmentType } from '../../../database/schemas';
import {
  ClassField,
  DateFieldOptional,
  EnumFieldOptional,
  StringFieldOptional,
} from '../../../decorators/field.decorators';
import { OutboundOrderItemReqDto } from './outbound-order-item.req.dto';

// Chỉ hợp lệ khi phiếu còn DRAFT (E259, BUG-090). `clientId` không có ở đây — bất biến ("1 phiếu
// = 1 khách hàng", xem entity `outbound_orders`). Tái dùng nguyên `OutboundOrderItemReqDto` cho
// items — replace-all, phải gửi lại toàn bộ dòng.
export class UpdateOutboundOrderReqDto {
  @DateFieldOptional({ description: 'Ngày giao' })
  readonly fulfillmentDate?: Date;

  @EnumFieldOptional(() => FulfillmentType, { description: 'Hình thức giao' })
  readonly fulfillmentType?: FulfillmentType;

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

  @ClassField(() => OutboundOrderItemReqDto, {
    each: true,
    description:
      'Dòng giao hàng — replace-all, phải gửi lại toàn bộ; khách hàng của phiếu không sửa được',
  })
  readonly items!: OutboundOrderItemReqDto[];
}
