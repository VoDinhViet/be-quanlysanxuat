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

  @DateFieldOptional({ description: 'Filter: neededDate >= neededDateFrom' })
  readonly neededDateFrom?: Date;

  @DateFieldOptional({ description: 'Filter: neededDate <= neededDateTo' })
  readonly neededDateTo?: Date;

  @DateFieldOptional({
    description: 'Filter: ngày tạo phiếu đề xuất >= createdDateFrom',
  })
  readonly createdDateFrom?: Date;

  @DateFieldOptional({
    description: 'Filter: ngày tạo phiếu đề xuất <= createdDateTo',
  })
  readonly createdDateTo?: Date;
}
