import { Exclude, Expose } from 'class-transformer';

import { InventoryDocumentStatus } from '../../../database/schemas';
import {
  BooleanField,
  ClassField,
  ClassFieldOptional,
  DateField,
  EnumField,
  NumberField,
  StringField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';
import { ItemUnitRefResDto } from '../../items/dto/item-unit-ref.res.dto';
import { OutsourcingOrderRefResDto } from '../../outsourcing-orders/dto/outsourcing-order-ref.res.dto';
import { SupplierRefResDto } from '../../suppliers/dto/supplier-ref.res.dto';
import { UserRefResDto } from '../../users/dto/user-ref.res.dto';
import { WarehouseRefResDto } from '../../warehouses/dto/warehouse-ref.res.dto';

@Exclude()
export class OutsourcingReceiptBaseResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField({ description: 'Mã phiếu nhận gia công ngoài' })
  code!: string;

  @Expose()
  @ClassField(() => OutsourcingOrderRefResDto)
  outsourcingOrder!: OutsourcingOrderRefResDto;

  @Expose()
  @ClassField(() => ItemUnitRefResDto)
  item!: ItemUnitRefResDto;

  @Expose()
  @NumberField({ description: 'SL nhận' })
  quantity!: number;

  @Expose()
  @ClassField(() => SupplierRefResDto)
  supplier!: SupplierRefResDto;

  @Expose()
  @ClassField(() => WarehouseRefResDto)
  warehouse!: WarehouseRefResDto;

  @Expose()
  @DateField({ description: 'Ngày nhận' })
  receiptDate!: Date;

  @Expose()
  @BooleanField({
    description: 'Có yêu cầu QC không — sinh IQC lúc post nếu có',
  })
  requiresIqc!: boolean;

  @Expose()
  @EnumField(() => InventoryDocumentStatus)
  status!: InventoryDocumentStatus;

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
