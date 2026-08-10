import { PageOptionsDto } from '../../../common/dto/offset-pagination/page-options.dto';
import {
  DateFieldOptional,
  EnumFieldOptional,
  StringFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';
import { PurchaseLedgerStatus } from '../purchase-ledger.constant';

export class GetPurchaseLedgerReqDto extends PageOptionsDto {
  @UUIDFieldOptional({ description: 'Filter theo đề xuất mua hàng' })
  readonly purchaseRequestId?: string;

  @StringFieldOptional({ description: 'Tìm theo tên hoặc mã vật tư' })
  readonly materialKeyword?: string;

  @UUIDFieldOptional({ description: 'Filter theo vật tư' })
  readonly itemId?: string;

  @UUIDFieldOptional({
    description: 'Filter theo LSX (production order) liên quan',
  })
  readonly productionOrderId?: string;

  @EnumFieldOptional(() => PurchaseLedgerStatus)
  readonly status?: PurchaseLedgerStatus;

  @DateFieldOptional({ description: 'Filter: neededDate = ngày này' })
  readonly neededDate?: Date;

  @DateFieldOptional({
    description: 'Filter: ngày tạo phiếu đề xuất >= fromDate',
  })
  readonly fromDate?: Date;

  @DateFieldOptional({
    description: 'Filter: ngày tạo phiếu đề xuất <= toDate',
  })
  readonly toDate?: Date;
}
