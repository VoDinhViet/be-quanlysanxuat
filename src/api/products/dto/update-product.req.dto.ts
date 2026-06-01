import { ProductItemType, ProductStatus } from '../../../database/schemas';
import {
  EnumFieldOptional,
  NumberFieldOptional,
  StringFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

export class UpdateProductReqDto {
  @UUIDFieldOptional({ nullable: true })
  clientId?: string | null;

  @StringFieldOptional({ maxLength: 50 })
  code?: string;

  @StringFieldOptional({ maxLength: 255 })
  name?: string;

  @EnumFieldOptional(() => ProductItemType)
  itemType?: ProductItemType;

  @UUIDFieldOptional()
  unitId?: string;

  @EnumFieldOptional(() => ProductStatus)
  status?: ProductStatus;

  @StringFieldOptional({ nullable: true })
  imageUrl?: string | null;

  @NumberFieldOptional({ min: 0 })
  defaultSalePrice?: number;

  @StringFieldOptional({ nullable: true })
  note?: string | null;
}
