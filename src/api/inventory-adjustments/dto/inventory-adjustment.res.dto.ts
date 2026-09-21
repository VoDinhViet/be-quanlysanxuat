import { Exclude, Expose } from 'class-transformer';

import {
  InventoryAdjustmentReason,
  InventoryAdjustmentType,
  InventoryDocumentStatus,
} from '../../../database/schemas';
import {
  ClassFieldOptional,
  DateField,
  DateFieldOptional,
  EnumField,
  StringField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';
import { UserRefResDto } from '../../users/dto/user-ref.res.dto';
import { InventoryAdjustmentItemResDto } from './inventory-adjustment-item.res.dto';

@Exclude()
export class InventoryAdjustmentResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField({ description: 'Mã phiếu' })
  code!: string;

  @Expose()
  @EnumField(() => InventoryAdjustmentType)
  adjustmentType!: InventoryAdjustmentType;

  @Expose()
  @EnumField(() => InventoryAdjustmentReason)
  reason!: InventoryAdjustmentReason;

  @Expose()
  @EnumField(() => InventoryDocumentStatus)
  status!: InventoryDocumentStatus;

  @Expose()
  @DateField({ description: 'Ngày chứng từ' })
  adjustmentDate!: Date;

  @Expose()
  @StringFieldOptional({ nullable: true })
  note!: string | null;

  @Expose()
  @ClassFieldOptional(() => InventoryAdjustmentItemResDto, { each: true })
  items!: InventoryAdjustmentItemResDto[];

  @Expose()
  @ClassFieldOptional(() => UserRefResDto, { nullable: true })
  posterBy!: UserRefResDto | null;

  @Expose()
  @DateFieldOptional({ nullable: true })
  postedAt!: Date | null;

  @Expose()
  @ClassFieldOptional(() => UserRefResDto, { nullable: true })
  creatorBy!: UserRefResDto | null;

  @Expose()
  @DateField()
  createdAt!: Date;

  @Expose()
  @DateField()
  updatedAt!: Date;
}
