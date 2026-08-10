import { Exclude, Expose } from 'class-transformer';

import {
  ClassField,
  NumberField,
  NumberFieldOptional,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';
import { PurchaseRequestItemRefResDto } from '../../purchase-requests/dto/purchase-request-item-ref.res.dto';

@Exclude()
export class PagePurchaseOrderItemResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @NumberField({ description: 'SL đặt mua' })
  quantity!: number;

  @Expose()
  @NumberFieldOptional({ nullable: true, description: 'Đơn giá' })
  unitPrice!: number | null;

  @Expose()
  @StringFieldOptional({ nullable: true })
  note!: string | null;

  @Expose()
  @ClassField(() => PurchaseRequestItemRefResDto)
  purchaseRequestItem!: PurchaseRequestItemRefResDto;
}
