import { Exclude, Expose } from 'class-transformer';

import { InventoryDocumentStatus } from '../../../database/schemas';
import {
  ClassField,
  ClassFieldOptional,
  DateField,
  EnumField,
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
import { WarehouseRefResDto } from '../../warehouses/dto/warehouse-ref.res.dto';

@Exclude()
export class PageSupplierReturnResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField({ description: 'Mã trả NCC' })
  code!: string;

  @Expose()
  @ClassField(() => ItemUnitRefResDto)
  item!: ItemUnitRefResDto;

  @Expose()
  @NumberField({ description: 'SL trả' })
  quantity!: number;

  @Expose()
  @ClassField(() => SupplierRefResDto)
  supplier!: SupplierRefResDto;

  @Expose()
  @ClassField(() => WarehouseRefResDto)
  warehouse!: WarehouseRefResDto;

  @Expose()
  @ClassFieldOptional(() => PurchaseOrderRefResDto, { nullable: true })
  purchaseOrder!: PurchaseOrderRefResDto | null;

  @Expose()
  @ClassFieldOptional(() => InventoryReceiptRefResDto, { nullable: true })
  inventoryReceipt!: InventoryReceiptRefResDto | null;

  @Expose()
  @StringFieldOptional({ nullable: true, description: 'Mã IQC' })
  iqcCode!: string | null;

  @Expose()
  @EnumField(() => InventoryDocumentStatus)
  status!: InventoryDocumentStatus;

  @Expose()
  @DateField({ description: 'Ngày trả' })
  returnDate!: Date;

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
