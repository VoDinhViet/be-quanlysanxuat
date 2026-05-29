import { DEFAULT_CURRENT_PAGE, DEFAULT_PAGE_LIMIT, OrderBy } from '../../../constants/app.constant';
import {
  EnumFieldOptional,
  NumberFieldOptional,
  StringFieldOptional,
} from '../../../decorators/field.decorators';

export class PageOptionsDto {
  @NumberFieldOptional({
    min: 1,
    default: DEFAULT_PAGE_LIMIT,
    int: true,
  })
  readonly limit: number = DEFAULT_PAGE_LIMIT;

  @NumberFieldOptional({
    min: 1,
    default: DEFAULT_CURRENT_PAGE,
    int: true,
  })
  readonly page: number = DEFAULT_CURRENT_PAGE;

  @StringFieldOptional()
  readonly q?: string;

  @EnumFieldOptional(() => OrderBy, { default: OrderBy.ASC })
  readonly order?: OrderBy = OrderBy.ASC;

  get offset() {
    return this.page ? (this.page - 1) * this.limit : 0;
  }
}
