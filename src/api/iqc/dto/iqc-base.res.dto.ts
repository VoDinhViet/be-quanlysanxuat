import { Exclude, Expose } from 'class-transformer';

import {
  IqcDisposition,
  IqcResult,
  IqcStatus,
} from '../../../database/schemas';
import {
  ClassField,
  ClassFieldOptional,
  DateField,
  EnumField,
  EnumFieldOptional,
  NumberField,
  StringField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';
import { InventoryReceiptRefResDto } from '../../inventory-receipts/dto/inventory-receipt-ref.res.dto';
import { ItemUnitRefResDto } from '../../items/dto/item-unit-ref.res.dto';
import { PurchaseOrderRefResDto } from '../../purchase-orders/dto/purchase-order-ref.res.dto';
import { SupplierRefResDto } from '../../suppliers/dto/supplier-ref.res.dto';
import { UserRefResDto } from '../../users/dto/user-ref.res.dto';

@Exclude()
export class IqcBaseResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField({ description: 'Mã IQC' })
  code!: string;

  @Expose()
  @ClassFieldOptional(() => InventoryReceiptRefResDto, { nullable: true })
  inventoryReceipt!: InventoryReceiptRefResDto | null;

  @Expose()
  @ClassFieldOptional(() => PurchaseOrderRefResDto, { nullable: true })
  purchaseOrder!: PurchaseOrderRefResDto | null;

  @Expose()
  @ClassField(() => SupplierRefResDto)
  supplier!: SupplierRefResDto;

  @Expose()
  @ClassField(() => ItemUnitRefResDto)
  item!: ItemUnitRefResDto;

  @Expose()
  @NumberField({ description: 'Số lượng kiểm' })
  quantity!: number;

  @Expose()
  @DateField({ description: 'Ngày kiểm' })
  inspectionDate!: Date;

  @Expose()
  @EnumField(() => IqcResult)
  result!: IqcResult;

  @Expose()
  @EnumFieldOptional(() => IqcDisposition, { nullable: true })
  disposition!: IqcDisposition | null;

  @Expose()
  @EnumField(() => IqcStatus)
  status!: IqcStatus;

  @Expose()
  @StringFieldOptional({ nullable: true, description: 'Lý do kiểm' })
  reason!: string | null;

  @Expose()
  @StringFieldOptional({ nullable: true, description: 'Ghi chú' })
  note!: string | null;

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
