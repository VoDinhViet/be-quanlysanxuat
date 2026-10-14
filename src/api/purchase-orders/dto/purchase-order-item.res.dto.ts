import { Exclude, Expose } from 'class-transformer';

import {
  ClassField,
  ClassFieldOptional,
  DateField,
  NumberField,
  NumberFieldOptional,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';
import { UnitRefResDto } from '../../units/dto/unit-ref.res.dto';
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
  @NumberField({
    description:
      'Tồn thực tế hiện tại của vật tư (gộp mọi kho), để Kho tham chiếu khi nhập',
  })
  onHand!: number;

  @Expose()
  @StringFieldOptional({
    nullable: true,
    description: 'Đơn vị báo giá (null = báo theo đơn vị chính)',
  })
  quotationUnit!: string | null;

  @Expose()
  @NumberFieldOptional({
    nullable: true,
    description: 'SL báo giá theo ĐVBG; thành tiền ước tính = đơn giá × SL này',
  })
  quotationQuantity!: number | null;

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
  @DateField({ description: 'Ngày cần của ĐXMH nguồn của dòng này' })
  neededDate!: Date;

  @Expose()
  @ClassField(() => PurchaseRequestItemRefResDto)
  purchaseRequestItem!: PurchaseRequestItemRefResDto;
}
