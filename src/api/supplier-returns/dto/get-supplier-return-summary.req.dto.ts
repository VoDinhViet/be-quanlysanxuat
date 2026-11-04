import { DateRangeLimitReqDto } from '../../../common/summary/summary.dto';
import { EnumFieldOptional } from '../../../decorators/field.decorators';
import { InventoryDocumentStatus } from '../../../database/schemas';
import { SupplierReturnSummaryGroupBy } from '../supplier-returns.constant';

export class GetSupplierReturnSummaryReqDto extends DateRangeLimitReqDto {
  @EnumFieldOptional(() => SupplierReturnSummaryGroupBy, {
    description: 'Gom theo trạng thái hoặc theo nhà cung cấp, mặc định status',
  })
  readonly groupBy?: SupplierReturnSummaryGroupBy;

  @EnumFieldOptional(() => InventoryDocumentStatus, {
    description: 'Chỉ tính phiếu trả ở trạng thái này',
  })
  readonly status?: InventoryDocumentStatus;
}
