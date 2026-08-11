import { Exclude, Expose } from 'class-transformer';

import {
  ClassField,
  ClassFieldOptional,
  NumberField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';
import { PurchaseRequestItemRefResDto } from '../../purchase-requests/dto/purchase-request-item-ref.res.dto';
import { QuotationItemSupplierResDto } from './quotation-item-supplier.res.dto';

@Exclude()
export class QuotationItemResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @NumberField({ description: 'SL báo giá' })
  quantity!: number;

  @Expose()
  @StringFieldOptional({ nullable: true })
  quantityAdjustmentReason!: string | null;

  @Expose()
  @ClassField(() => PurchaseRequestItemRefResDto)
  purchaseRequestItem!: PurchaseRequestItemRefResDto;

  @Expose()
  @ClassFieldOptional(() => QuotationItemSupplierResDto, { each: true })
  suppliers!: QuotationItemSupplierResDto[];
}
