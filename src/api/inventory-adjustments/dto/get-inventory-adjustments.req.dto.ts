import {
  InventoryAdjustmentReason,
  InventoryAdjustmentType,
  InventoryDocumentStatus,
} from '../../../database/schemas';
import { PageOptionsDto } from '../../../common/dto/offset-pagination/page-options.dto';
import {
  DateFieldOptional,
  EnumFieldOptional,
} from '../../../decorators/field.decorators';

export class GetInventoryAdjustmentsReqDto extends PageOptionsDto {
  @EnumFieldOptional(() => InventoryAdjustmentType)
  readonly adjustmentType?: InventoryAdjustmentType;

  @EnumFieldOptional(() => InventoryAdjustmentReason)
  readonly reason?: InventoryAdjustmentReason;

  @EnumFieldOptional(() => InventoryDocumentStatus)
  readonly status?: InventoryDocumentStatus;

  @DateFieldOptional({ description: 'Filter: adjustmentDate >= startDate' })
  readonly startDate?: Date;

  @DateFieldOptional({ description: 'Filter: adjustmentDate <= endDate' })
  readonly endDate?: Date;
}
