import { PageOptionsDto } from '../../../common/dto/offset-pagination/page-options.dto';
import {
  DateFieldOptional,
  EnumFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';
import { PurchaseLedgerStatus } from '../purchase-ledger.constant';

export class GetPurchaseLedgerReqDto extends PageOptionsDto {
  @UUIDFieldOptional({ description: 'Filter theo đề xuất mua hàng' })
  readonly purchaseRequestId?: string;

  @UUIDFieldOptional({ description: 'Filter theo vật tư' })
  readonly itemId?: string;

  @UUIDFieldOptional({
    description: 'Filter theo LSX (production order) liên quan',
  })
  readonly productionOrderId?: string;

  @EnumFieldOptional(() => PurchaseLedgerStatus)
  readonly status?: PurchaseLedgerStatus;

  @DateFieldOptional({ description: 'Filter: neededDate >= neededStartDate' })
  readonly neededStartDate?: Date;

  @DateFieldOptional({ description: 'Filter: neededDate <= neededEndDate' })
  readonly neededEndDate?: Date;

  @DateFieldOptional({
    description: 'Filter: ngày tạo phiếu đề xuất >= createdStartDate',
  })
  readonly createdStartDate?: Date;

  @DateFieldOptional({
    description: 'Filter: ngày tạo phiếu đề xuất <= createdEndDate',
  })
  readonly createdEndDate?: Date;
}
