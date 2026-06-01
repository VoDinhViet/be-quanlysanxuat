import { PageOptionsDto } from '../../../common/dto/offset-pagination/page-options.dto';
import { ProductItemType, ProductStatus } from '../../../database/schemas';
import { EnumFieldOptional, UUIDFieldOptional } from '../../../decorators/field.decorators';

export class GetProductsReqDto extends PageOptionsDto {
  @UUIDFieldOptional({ nullable: true })
  clientId?: string;

  @EnumFieldOptional(() => ProductItemType)
  itemType?: ProductItemType;

  @EnumFieldOptional(() => ProductStatus)
  status?: ProductStatus;
}
