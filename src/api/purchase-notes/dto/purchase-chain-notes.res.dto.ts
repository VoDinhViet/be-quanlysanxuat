import { Exclude, Expose } from 'class-transformer';

import {
  ClassField,
  StringField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';

@Exclude()
export class PurchaseChainNoteItemResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField({ description: 'Mã chứng từ' })
  code!: string;

  @Expose()
  @StringFieldOptional({ nullable: true })
  note!: string | null;
}

@Exclude()
export class PurchaseChainNotesResDto {
  @Expose()
  @ClassField(() => PurchaseChainNoteItemResDto, {
    each: true,
    description: 'Đề xuất mua hàng liên quan trong chuỗi',
  })
  purchaseRequests!: PurchaseChainNoteItemResDto[];

  @Expose()
  @ClassField(() => PurchaseChainNoteItemResDto, {
    each: true,
    description: 'Báo giá liên quan trong chuỗi',
  })
  quotations!: PurchaseChainNoteItemResDto[];

  @Expose()
  @ClassField(() => PurchaseChainNoteItemResDto, {
    each: true,
    description: 'Đơn mua hàng liên quan trong chuỗi',
  })
  purchaseOrders!: PurchaseChainNoteItemResDto[];

  @Expose()
  @ClassField(() => PurchaseChainNoteItemResDto, {
    each: true,
    description: 'Phiếu nhập kho liên quan trong chuỗi',
  })
  inventoryReceipts!: PurchaseChainNoteItemResDto[];
}
