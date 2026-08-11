import { PageOptionsDto } from '../../../common/dto/offset-pagination/page-options.dto';
import { PurchaseQuotationStatus } from '../../../database/schemas';
import {
  DateFieldOptional,
  EnumFieldOptional,
  StringFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

export class GetQuotationsReqDto extends PageOptionsDto {
  @UUIDFieldOptional({ description: 'Filter theo NCC' })
  readonly supplierId?: string;

  @EnumFieldOptional(() => PurchaseQuotationStatus)
  readonly status?: PurchaseQuotationStatus;

  @UUIDFieldOptional({
    description: 'Filter theo đề xuất mua hàng có dòng trong báo giá',
  })
  readonly purchaseRequestId?: string;

  @UUIDFieldOptional({ description: 'Filter theo người tạo RFQ' })
  readonly createdBy?: string;

  @StringFieldOptional({
    description: 'Tìm theo tên hoặc mã vật tư trong dòng báo giá',
  })
  readonly materialKeyword?: string;

  @DateFieldOptional({ description: 'Filter: createdAt >= fromDate' })
  readonly fromDate?: Date;

  @DateFieldOptional({ description: 'Filter: createdAt <= toDate' })
  readonly toDate?: Date;
}
