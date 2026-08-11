import { Exclude, Expose } from 'class-transformer';

import {
  ClassField,
  NumberField,
  NumberFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';
import { PurchaseRequestItemRefResDto } from '../../purchase-requests/dto/purchase-request-item-ref.res.dto';
import { SupplierRefResDto } from '../../suppliers/dto/supplier-ref.res.dto';

@Exclude()
export class PageQuotationItemResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @ClassField(() => SupplierRefResDto)
  supplier!: SupplierRefResDto;

  @Expose()
  @NumberField({ description: 'SL hỏi giá' })
  quantity!: number;

  @Expose()
  @NumberFieldOptional({ nullable: true, description: 'Đơn giá NCC báo' })
  unitPrice!: number | null;

  @Expose()
  @ClassField(() => PurchaseRequestItemRefResDto)
  purchaseRequestItem!: PurchaseRequestItemRefResDto;
}
