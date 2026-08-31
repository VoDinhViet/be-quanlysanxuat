import {
  InventoryAdjustmentReason,
  InventoryAdjustmentType,
} from '../../../database/schemas';
import {
  ClassField,
  DateFieldOptional,
  EnumFieldOptional,
  StringFieldOptional,
} from '../../../decorators/field.decorators';
import { InventoryAdjustmentItemReqDto } from './inventory-adjustment-item.req.dto';

/** Chỉ hợp lệ khi phiếu còn `DRAFT` (`E098`). */
export class UpdateInventoryAdjustmentReqDto {
  @EnumFieldOptional(() => InventoryAdjustmentType)
  readonly adjustmentType?: InventoryAdjustmentType;

  @EnumFieldOptional(() => InventoryAdjustmentReason)
  readonly reason?: InventoryAdjustmentReason;

  @DateFieldOptional()
  readonly adjustmentDate?: Date;

  @StringFieldOptional({ maxLength: 1000, nullable: true })
  readonly note?: string | null;

  @ClassField(() => InventoryAdjustmentItemReqDto, { each: true, minItems: 1 })
  readonly items!: InventoryAdjustmentItemReqDto[];
}
