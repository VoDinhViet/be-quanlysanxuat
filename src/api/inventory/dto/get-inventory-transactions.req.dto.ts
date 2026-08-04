import {
  InventoryItemType,
  InventoryReferenceType,
  InventoryTransactionType,
} from '../../../database/schemas';
import { PageOptionsDto } from '../../../common/dto/offset-pagination/page-options.dto';
import {
  DateFieldOptional,
  EnumFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

export class GetInventoryTransactionsReqDto extends PageOptionsDto {
  @UUIDFieldOptional()
  readonly warehouseId?: string;

  @EnumFieldOptional(() => InventoryItemType)
  readonly itemType?: InventoryItemType;

  @UUIDFieldOptional()
  readonly productId?: string;

  @UUIDFieldOptional()
  readonly materialId?: string;

  @EnumFieldOptional(() => InventoryTransactionType)
  readonly type?: InventoryTransactionType;

  @EnumFieldOptional(() => InventoryReferenceType)
  readonly referenceType?: InventoryReferenceType;

  @DateFieldOptional({ description: 'Filter: transactionDate >= fromDate' })
  readonly fromDate?: Date;

  @DateFieldOptional({ description: 'Filter: transactionDate <= toDate' })
  readonly toDate?: Date;
}
