import {
  InventoryDocumentStatus,
  InventoryReceiptType,
} from '../../../database/schemas';
import { PageOptionsDto } from '../../../common/dto/offset-pagination/page-options.dto';
import {
  DateFieldOptional,
  EnumFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

export class GetInventoryReceiptsReqDto extends PageOptionsDto {
  @UUIDFieldOptional()
  readonly warehouseId?: string;

  @EnumFieldOptional(() => InventoryReceiptType)
  readonly receiptType?: InventoryReceiptType;

  @EnumFieldOptional(() => InventoryDocumentStatus)
  readonly status?: InventoryDocumentStatus;

  @UUIDFieldOptional()
  readonly supplierId?: string;

  @UUIDFieldOptional()
  readonly productionOrderId?: string;

  @UUIDFieldOptional()
  readonly productionJobId?: string;

  @UUIDFieldOptional({ description: 'Filter theo đơn mua hàng' })
  readonly purchaseOrderId?: string;

  @DateFieldOptional({ description: 'Filter: receiptDate >= startDate' })
  readonly startDate?: Date;

  @DateFieldOptional({ description: 'Filter: receiptDate <= endDate' })
  readonly endDate?: Date;
}
