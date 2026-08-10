import { PageOptionsDto } from '../../../common/dto/offset-pagination/page-options.dto';
import { PurchaseOrderStatus } from '../../../database/schemas';
import {
  DateFieldOptional,
  EnumFieldOptional,
  StringFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

export class GetPurchaseOrdersReqDto extends PageOptionsDto {
  @UUIDFieldOptional({ description: 'Filter theo NCC' })
  readonly supplierId?: string;

  @EnumFieldOptional(() => PurchaseOrderStatus)
  readonly status?: PurchaseOrderStatus;

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
