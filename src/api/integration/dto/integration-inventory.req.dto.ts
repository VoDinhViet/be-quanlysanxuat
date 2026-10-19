import {
  BooleanFieldOptional,
  EnumField,
  EnumFieldOptional,
} from '../../../decorators/field.decorators';
import { DateRangeLimitReqDto } from './integration-common.dto';

export enum InventoryView {
  STOCK_RANKING = 'stock_ranking',
  BELOW_MIN = 'below_min',
  RECEIPTS_BY_STATUS = 'receipts_by_status',
}

export enum InventorySortOrder {
  HIGHEST = 'highest',
  LOWEST = 'lowest',
}

export class InventorySummaryReqDto extends DateRangeLimitReqDto {
  @EnumField(() => InventoryView, {
    description:
      'stock_ranking: vật tư xếp theo tồn; below_min: vật tư tồn dưới mức tối thiểu (kể cả hết hàng); receipts_by_status: số phiếu nhập theo loại và trạng thái',
  })
  readonly view!: InventoryView;

  @EnumFieldOptional(() => InventorySortOrder, {
    description: 'stock_ranking và below_min, mặc định highest',
  })
  readonly order?: InventorySortOrder;

  @BooleanFieldOptional({
    description:
      'stock_ranking: chỉ vật tư còn hàng, mặc định false; order=lowest luôn chỉ lấy vật tư còn hàng',
  })
  readonly inStockOnly?: boolean;
}
