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
export class PurchaseOrderItemResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @NumberField({ description: 'SL đặt mua' })
  quantity!: number;

  @Expose()
  @NumberField({ description: 'SL đã nhập kho (Σ phiếu nhập POSTED)' })
  receivedQuantity!: number;

  @Expose()
  @StringFieldOptional({ nullable: true, description: 'Lý do điều chỉnh SL' })
  quantityAdjustmentReason!: string | null;

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
