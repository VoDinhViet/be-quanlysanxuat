import { ProductItemType } from '../../../database/schemas';
import {
  EnumField,
  NumberFieldOptional,
  StringField,
  StringFieldOptional,
  UUIDField,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

export class CreateProductReqDto {
  @UUIDFieldOptional({ nullable: true })
  clientId?: string | null;

  @StringField({ maxLength: 50 })
  code!: string;

  @StringField({ maxLength: 255 })
  name!: string;

  @EnumField(() => ProductItemType)
  itemType!: ProductItemType;

  @UUIDField()
  unitId!: string;

  @StringField({ maxLength: 50 })
  revisionNo!: string;

  @StringFieldOptional({ nullable: true })
  imageUrl?: string | null;

  @NumberFieldOptional({ min: 0 })
  defaultSalePrice?: number;

  @StringFieldOptional({ nullable: true })
  note?: string | null;
}
