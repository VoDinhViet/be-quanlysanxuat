import { PageOptionsDto } from '../../../common/dto/offset-pagination/page-options.dto';
import {
  FulfillmentType,
  OutboundOrderInvoiceStatus,
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

  @EnumFieldOptional(() => OutboundOrderInvoiceStatus, {
    description:
      'Trạng thái hóa đơn. DO chưa giao luôn là NOT_ISSUED, nên lọc "chưa xuất" cần kèm status=DELIVERED',
  })
  readonly invoiceStatus?: OutboundOrderInvoiceStatus;

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
