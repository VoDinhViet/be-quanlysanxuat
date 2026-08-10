import { Exclude, Expose } from 'class-transformer';

import {
  InventoryReferenceType,
  InventoryTransactionType,
} from '../../../database/schemas';
import {
  ClassField,
  ClassFieldOptional,
  DateField,
  EnumField,
  NumberField,
  UUIDField,
} from '../../../decorators/field.decorators';
import { ItemRefResDto } from '../../items/dto/item-ref.res.dto';
import { UserRefResDto } from '../../users/dto/user-ref.res.dto';
import { WarehouseRefResDto } from '../../warehouses/dto/warehouse-ref.res.dto';

@Exclude()
export class InventoryTransactionResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @ClassField(() => WarehouseRefResDto)
  warehouse!: WarehouseRefResDto;

  @Expose()
  @ClassField(() => ItemRefResDto)
  item!: ItemRefResDto;

  @Expose()
  @EnumField(() => InventoryTransactionType)
  type!: InventoryTransactionType;

  @Expose()
  @NumberField({ description: 'Số lượng có dấu — dương là nhập, âm là xuất' })
  quantity!: number;

  @Expose()
  @EnumField(() => InventoryReferenceType)
  referenceType!: InventoryReferenceType;

  @Expose()
  @UUIDField({ description: 'Id phiếu nhập/xuất sinh ra bút toán này' })
  referenceId!: string;

  @Expose()
  @DateField()
  transactionDate!: Date;

  @Expose()
  @ClassFieldOptional(() => UserRefResDto, { nullable: true })
  creatorBy!: UserRefResDto | null;

  @Expose()
  @DateField()
  createdAt!: Date;
}
