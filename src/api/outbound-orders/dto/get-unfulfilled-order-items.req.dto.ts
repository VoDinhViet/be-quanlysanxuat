import { PageOptionsDto } from '../../../common/dto/offset-pagination/page-options.dto';
import {
  BooleanFieldOptional,
  StringFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

export class GetUnfulfilledOrderItemsReqDto extends PageOptionsDto {
  // Bộ lọc khung "Chọn PO/Job cần giao" (bước ① Tạo DO). Bước ① không khoá khách hàng ở BE, còn
  // popup trên trang Sửa DO (BUG-090) truyền sẵn `clientId` của phiếu để mọi dòng thêm mới cùng khách.
  @UUIDFieldOptional({ description: 'Chỉ lấy dòng PO của khách hàng này' })
  readonly clientId?: string;

  @StringFieldOptional({
    description: 'Số PO của khách hàng hoặc mã đơn hàng (SO) chứa từ khoá',
  })
  readonly poNo?: string;

  @StringFieldOptional({ description: 'Mã Job chứa từ khoá' })
  readonly jobCode?: string;

  @StringFieldOptional({
    description: 'Mã / tên / phiên bản thành phẩm chứa từ khoá',
  })
  readonly itemKeyword?: string;

  @BooleanFieldOptional({
    description: 'Chỉ lấy dòng còn có thể giao (Tồn TP − Đã giữ > 0)',
  })
  readonly deliverableOnly?: boolean;

  // Loại phiếu đang sửa khỏi "Đã giữ" — cùng lý do `excludeOutboundOrderId` ở
  // `getOutboundHeldQuantities` (`outbound-orders.query.ts`).
  @UUIDFieldOptional({
    description: 'Loại phiếu này khỏi tính "Đã giữ" (đang Sửa chính phiếu này)',
  })
  readonly excludeOutboundOrderId?: string;
}
