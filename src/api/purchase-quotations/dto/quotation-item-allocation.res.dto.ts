import { Exclude, Expose } from 'class-transformer';

import {
  ClassField,
  NumberField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';
import { PurchaseRequestRefResDto } from '../../purchase-requests/dto/purchase-request-ref.res.dto';

@Exclude()
export class QuotationAllocationPurchaseRequestItemResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @NumberField({ description: 'SL đề xuất' })
  quantity!: number;

  @Expose()
  @StringFieldOptional({ nullable: true, description: 'Ghi chú dòng đề xuất' })
  note!: string | null;
}

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
  @ClassField(() => PurchaseRequestRefResDto)
  purchaseRequest!: PurchaseRequestRefResDto;

  @Expose()
  @ClassField(() => QuotationAllocationPurchaseRequestItemResDto)
  purchaseRequestItem!: QuotationAllocationPurchaseRequestItemResDto;
}
