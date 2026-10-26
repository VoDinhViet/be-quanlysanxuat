import { Exclude, Expose } from 'class-transformer';

import { NumberField } from '../../../decorators/field.decorators';

@Exclude()
export class OutboundOrderStatsResDto {
  @Expose()
  @NumberField({ int: true, description: 'Tổng số DO khớp bộ lọc' })
  total!: number;

  @Expose()
  @NumberField({
    int: true,
    description:
      'Số DO đã giao (DELIVERED) mà chưa xuất hóa đơn, trong các DO khớp bộ lọc (bỏ qua bộ lọc invoiceStatus)',
  })
  notInvoiced!: number;
}
