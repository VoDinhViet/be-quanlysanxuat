import { PageOptionsDto } from '../../../common/dto/offset-pagination/page-options.dto';
import { UUIDFieldOptional } from '../../../decorators/field.decorators';

export class GetUnfulfilledOrderItemsReqDto extends PageOptionsDto {
  // Lọc theo khách hàng — dùng khi mở lại popup từ trang Sửa một DO đã có dòng (BUG-090): mọi dòng
  // thêm mới phải cùng khách hàng với phiếu, nên lọc thẳng ở BE thay vì để FE tự chặn như bước ①
  // của wizard Tạo (khoá client theo dòng đã chọn, không lọc BE — xem
  // CreateOutboundOrderPickerSection.tsx).
  @UUIDFieldOptional({ description: 'Chỉ lấy dòng PO của khách hàng này' })
  readonly clientId?: string;

  // Loại phiếu đang sửa khỏi "Đã giữ" — cùng lý do `excludeOutboundOrderId` ở
  // `getOutboundHeldQuantities` (`outbound-orders.query.ts`).
  @UUIDFieldOptional({
    description: 'Loại phiếu này khỏi tính "Đã giữ" (đang Sửa chính phiếu này)',
  })
  readonly excludeOutboundOrderId?: string;
}
