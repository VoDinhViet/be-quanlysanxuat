import {
  BooleanFieldOptional,
  EnumFieldOptional,
} from '../../../decorators/field.decorators';
import { OrderStatus } from '../../../database/schemas';
import { SummaryMetric } from '../../../common/summary/summary.dto';
import { OrderTotalRangeReqDto } from './order-total-range.req.dto';

export enum OrderValueGroupBy {
  MONTH = 'month',
  CLIENT = 'client',
  STATUS = 'status',
  SALESPERSON = 'salesperson',
}

export class GetOrderValueSummaryReqDto extends OrderTotalRangeReqDto {
  @EnumFieldOptional(() => OrderValueGroupBy, {
    description:
      'Nhóm theo tháng, khách hàng, trạng thái hoặc nhân viên phụ trách; mặc định month. minTotal, maxTotal chỉ áp khi groupBy=client; limit chỉ áp khi groupBy=client hoặc salesperson',
  })
  readonly groupBy?: OrderValueGroupBy;

  @EnumFieldOptional(() => SummaryMetric, {
    description:
      'Tiêu chí xếp hạng các nhóm client, status, salesperson: total (giá trị) hoặc count (số đơn); mặc định total',
  })
  readonly metric?: SummaryMetric;

  @EnumFieldOptional(() => OrderStatus, {
    description: 'Chỉ đơn ở trạng thái này',
  })
  readonly status?: OrderStatus;

  @BooleanFieldOptional({
    description:
      'Bỏ đơn REJECTED; mặc định true, trừ khi groupBy=status hoặc đã lọc theo status',
  })
  readonly excludeRejected?: boolean;
}
