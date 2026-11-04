import {
  BooleanFieldOptional,
  EnumFieldOptional,
} from '../../../decorators/field.decorators';
import { LimitReqDto } from '../../../common/summary/summary.dto';

export enum StockRankingOrder {
  HIGHEST = 'highest',
  LOWEST = 'lowest',
}

export class GetStockRankingReqDto extends LimitReqDto {
  @EnumFieldOptional(() => StockRankingOrder, {
    description: 'Mặc định highest (tồn nhiều nhất trước)',
  })
  readonly order?: StockRankingOrder;

  @BooleanFieldOptional({
    description:
      'Chỉ vật tư còn hàng, mặc định false; order=lowest luôn chỉ lấy vật tư còn hàng',
  })
  readonly inStockOnly?: boolean;

  @BooleanFieldOptional({
    description:
      'Chỉ vật tư có tồn tối thiểu và đang tồn dưới mức đó (kể cả hết hàng)',
  })
  readonly belowMinStock?: boolean;
}
