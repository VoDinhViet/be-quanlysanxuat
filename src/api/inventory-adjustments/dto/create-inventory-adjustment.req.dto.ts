import {
  InventoryAdjustmentReason,
  InventoryAdjustmentType,
} from '../../../database/schemas';
import {
  ClassField,
  DateField,
  EnumField,
  StringFieldOptional,
} from '../../../decorators/field.decorators';
import { InventoryAdjustmentItemReqDto } from './inventory-adjustment-item.req.dto';

export class CreateInventoryAdjustmentReqDto {
  @EnumField(() => InventoryAdjustmentType)
  readonly adjustmentType!: InventoryAdjustmentType;

  @EnumField(() => InventoryAdjustmentReason)
  readonly reason!: InventoryAdjustmentReason;

  @DateField({ description: 'Ngày chứng từ' })
  readonly adjustmentDate!: Date;

  @StringFieldOptional({ maxLength: 1000, nullable: true })
  readonly note?: string | null;

  @ClassField(() => InventoryAdjustmentItemReqDto, { each: true, minItems: 1 })
  readonly items!: InventoryAdjustmentItemReqDto[];
}
