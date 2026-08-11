import { PageOptionsDto } from '../../../common/dto/offset-pagination/page-options.dto';
import { PurchaseOrderStatus } from '../../../database/schemas';
import {
  DateFieldOptional,
  EnumFieldOptional,
  StringFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';
import { PurchaseOrderProgress } from '../purchase-orders.constant';

export class GetPurchaseOrdersReqDto extends PageOptionsDto {
  @UUIDFieldOptional({ description: 'Filter theo NCC' })
  readonly supplierId?: string;

  @UUIDFieldOptional({
    description: 'Filter theo báo giá NCC đã sinh ra đơn mua',
  })
  readonly quotationId?: string;

  @EnumFieldOptional(() => PurchaseOrderStatus)
  readonly status?: PurchaseOrderStatus;

  @EnumFieldOptional(() => PurchaseOrderProgress, {
    description:
      'Filter theo tiến độ nhận hàng (5 giá trị, suy từ status + receivedQuantity/orderedQuantity) — độc lập với status (3 giá trị, lọc thẳng cột)',
  })
  readonly progress?: PurchaseOrderProgress;

  @UUIDFieldOptional({
    description: 'Filter theo đề xuất mua hàng có dòng trong đơn mua',
  })
  readonly purchaseRequestId?: string;

  @StringFieldOptional({
    description: 'Tìm theo tên hoặc mã vật tư trong dòng đơn mua',
  })
  readonly materialKeyword?: string;

  @DateFieldOptional({ description: 'Filter: orderDate >= fromDate' })
  readonly fromDate?: Date;

  @DateFieldOptional({ description: 'Filter: orderDate <= toDate' })
  readonly toDate?: Date;
}
