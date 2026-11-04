import { Exclude, Expose } from 'class-transformer';

import {
  NumberField,
  StringFieldOptional,
} from '../../../decorators/field.decorators';

@Exclude()
export class OrderValueSummaryResDto {
  @Expose()
  @StringFieldOptional({
    description: 'Ngày đầu tháng (YYYY-MM-DD); chỉ có khi groupBy=month',
  })
  month?: string;

  @Expose()
  @StringFieldOptional({
    description: 'Trạng thái đơn; chỉ có khi groupBy=status',
  })
  status?: string;

  @Expose()
  @StringFieldOptional({
    description: 'Tên khách hàng; chỉ có khi groupBy=client',
  })
  clientName?: string;

  @Expose()
  @StringFieldOptional({
    description: 'Tên nhân viên phụ trách; chỉ có khi groupBy=salesperson',
  })
  salespersonName?: string;

  @Expose()
  @NumberField({ description: 'Tổng giá trị đơn của nhóm, quy VND' })
  totalValue!: number;

  @Expose()
  @NumberField({ int: true, description: 'Số đơn của nhóm' })
  orderCount!: number;
}
