import { PageOptionsDto } from '../../../common/dto/offset-pagination/page-options.dto';
import {
  FulfillmentType,
  OutboundOrderStatus,
} from '../../../database/schemas';
import {
  DateFieldOptional,
  EnumFieldOptional,
  StringFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

export class GetOutboundOrdersReqDto extends PageOptionsDto {
  @UUIDFieldOptional()
  readonly clientId?: string;

  @EnumFieldOptional(() => OutboundOrderStatus)
  readonly status?: OutboundOrderStatus;

  @EnumFieldOptional(() => FulfillmentType)
  readonly fulfillmentType?: FulfillmentType;

  @DateFieldOptional({ description: 'Filter: fulfillmentDate >= startDate' })
  readonly startDate?: Date;

  @DateFieldOptional({ description: 'Filter: fulfillmentDate <= endDate' })
  readonly endDate?: Date;

  @StringFieldOptional({
    description:
      'Filter: PO của khách hoặc mã đơn hàng (SO) của một dòng trong phiếu',
  })
  readonly poNo?: string;

  @StringFieldOptional({
    description: 'Filter: mã thành phẩm của một dòng trong phiếu',
  })
  readonly itemCode?: string;

  @StringFieldOptional({
    description: 'Filter: tên thành phẩm của một dòng trong phiếu',
  })
  readonly itemName?: string;
}
