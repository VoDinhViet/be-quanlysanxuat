import { PageOptionsDto } from '../../../common/dto/offset-pagination/page-options.dto';
import { ProductStatus, ProductType } from '../../../database/schemas';
import {
  EnumFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

export class GetProductsReqDto extends PageOptionsDto {
  @UUIDFieldOptional({ description: 'Filter by client id' })
  readonly clientId?: string;

  @UUIDFieldOptional({ description: 'Filter by product group id' })
  readonly productGroupId?: string;

  @EnumFieldOptional(() => ProductType)
  readonly type?: ProductType;

  @EnumFieldOptional(() => ProductStatus)
  readonly status?: ProductStatus;
}
