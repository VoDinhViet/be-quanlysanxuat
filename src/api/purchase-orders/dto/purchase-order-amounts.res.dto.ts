import { Exclude, Expose } from 'class-transformer';

import {
  NumberField,
  StringFieldOptional,
} from '../../../decorators/field.decorators';

/** Cách ra tổng tiền PO: tiền hàng + VAT + chi phí khác — dùng chung cho chi tiết PO và chi tiết yêu cầu thanh toán. */
@Exclude()
export class PurchaseOrderAmountsResDto {
  @Expose()
  @NumberField({ description: 'Tiền hàng chưa thuế (Σ SL đặt × đơn giá)' })
  subtotal!: number;

  @Expose()
  @NumberField({ description: 'Thuế VAT (% trên tiền hàng)' })
  vatPercent!: number;

  @Expose()
  @NumberField({ description: 'Tiền VAT = tiền hàng × vatPercent / 100' })
  vatAmount!: number;

  @Expose()
  @NumberField({ description: 'Chi phí khác (vận chuyển, bốc xếp...)' })
  otherCost!: number;

  @Expose()
  @StringFieldOptional({
    nullable: true,
    description: 'Diễn giải chi phí khác',
  })
  otherCostNote!: string | null;
}
