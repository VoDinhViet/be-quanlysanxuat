import {
  InventoryReferenceType,
  InventoryTransactionType,
  ItemType,
} from '../../../database/schemas';
import { PageOptionsDto } from '../../../common/dto/offset-pagination/page-options.dto';
import {
  DateFieldOptional,
  EnumFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

export class GetInventoryTransactionsReqDto extends PageOptionsDto {
  @EnumFieldOptional(() => ItemType)
  readonly itemType?: ItemType;

  @UUIDFieldOptional()
  readonly itemId?: string;

  @EnumFieldOptional(() => InventoryTransactionType)
  readonly type?: InventoryTransactionType;

  @EnumFieldOptional(() => InventoryReferenceType)
  readonly referenceType?: InventoryReferenceType;

  @DateFieldOptional({ description: 'Filter: transactionDate >= startDate' })
  readonly startDate?: Date;

  @DateFieldOptional({ description: 'Filter: transactionDate <= endDate' })
  readonly endDate?: Date;
}
