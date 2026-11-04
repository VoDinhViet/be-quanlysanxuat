import {
  DateRangeReqDto,
  LimitField,
} from '../../../common/summary/summary.dto';
import { NumberFieldOptional } from '../../../decorators/field.decorators';
import { DEFAULT_ORDER_RANKING_LIMIT } from '../orders-summary.constant';

export class OrderTotalRangeReqDto extends DateRangeReqDto {
  @NumberFieldOptional({
    min: 0,
    description:
      'Chỉ giữ tổng giá trị (quy VND) từ mức này trở lên (>=): của từng đơn, hoặc của từng khách trong kỳ khi groupBy=client (kể cả metric=count)',
  })
  readonly minTotal?: number;

  @NumberFieldOptional({
    min: 0,
    description:
      'Chỉ giữ tổng giá trị (quy VND) dưới mức này (<): của từng đơn, hoặc của từng khách trong kỳ khi groupBy=client (kể cả metric=count)',
  })
  readonly maxTotal?: number;

  @LimitField(DEFAULT_ORDER_RANKING_LIMIT)
  readonly limit?: number;
}
