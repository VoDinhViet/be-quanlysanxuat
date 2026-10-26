import { FulfillmentType } from '../../../database/schemas';
import {
  DateFieldOptional,
  EnumFieldOptional,
  StringFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

/** Bộ lọc chung của danh sách DO, không có trạng thái và hóa đơn: mỗi thẻ thống kê tự đếm theo
 * trạng thái của nó. */
export class GetOutboundOrderStatsReqDto {
  @StringFieldOptional()
  readonly q?: string;

  @UUIDFieldOptional()
  readonly clientId?: string;

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
