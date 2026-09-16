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
import { IqcRefResDto } from '../../iqc/dto/iqc-ref.res.dto';
import { ItemUnitRefResDto } from '../../items/dto/item-unit-ref.res.dto';
import { OutsourcingReceiptRefResDto } from '../../outsourcing-receipts/dto/outsourcing-receipt-ref.res.dto';
import { PurchaseOrderRefResDto } from '../../purchase-orders/dto/purchase-order-ref.res.dto';
import { SupplierRefResDto } from '../../suppliers/dto/supplier-ref.res.dto';
import { UserRefResDto } from '../../users/dto/user-ref.res.dto';

@Exclude()
export class SupplierReturnBaseResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField({ description: 'Mã trả NCC' })
  code!: string;

  @Expose()
  @StringField({
    description:
      'Mã vật tư/part — từ item nếu có, không thì snapshot lúc tạo (node COMPONENT từ OS-IN)',
  })
  itemCode!: string;

  @Expose()
  @StringField({ description: 'Tên vật tư/part — cùng quy tắc itemCode' })
  itemName!: string;

  @Expose()
  @ClassFieldOptional(() => ItemUnitRefResDto, {
    nullable: true,
    description:
      'null khi trả node COMPONENT nhận về từ OS-IN (không phải một item)',
  })
  item!: ItemUnitRefResDto | null;

  @Expose()
  @NumberField({ description: 'SL trả' })
  quantity!: number;

  @Expose()
  @ClassField(() => SupplierRefResDto)
  supplier!: SupplierRefResDto;

  @Expose()
  @ClassFieldOptional(() => PurchaseOrderRefResDto, { nullable: true })
  purchaseOrder!: PurchaseOrderRefResDto | null;

  @Expose()
  @ClassFieldOptional(() => InventoryReceiptRefResDto, { nullable: true })
  inventoryReceipt!: InventoryReceiptRefResDto | null;

  @Expose()
  @ClassFieldOptional(() => OutsourcingReceiptRefResDto, { nullable: true })
  outsourcingReceipt!: OutsourcingReceiptRefResDto | null;

  @Expose()
  @ClassFieldOptional(() => IqcRefResDto, { nullable: true })
  iqc!: IqcRefResDto | null;

  @Expose()
  @StringFieldOptional({ nullable: true, description: 'Ghi chú' })
  note!: string | null;

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
