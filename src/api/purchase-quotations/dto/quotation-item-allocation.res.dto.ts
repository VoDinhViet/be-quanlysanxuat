import { Exclude, Expose } from 'class-transformer';

import {
  ClassField,
  NumberField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';
import { PurchaseRequestItemRefResDto } from '../../purchase-requests/dto/purchase-request-item-ref.res.dto';

@Exclude()
export class QuotationItemAllocationResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @NumberField({ description: 'SL báo giá phân bổ cho dòng đề xuất này' })
  quantity!: number;

  @Expose()
  @StringFieldOptional({ nullable: true })
  quantityAdjustmentReason!: string | null;

  @Expose()
  @ClassField(() => PurchaseRequestItemRefResDto)
  purchaseRequestItem!: PurchaseRequestItemRefResDto;
}
