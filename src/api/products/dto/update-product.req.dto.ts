import { ProductStatus } from '../../../database/schemas';
import {
  EnumFieldOptional,
  StringFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

export class UpdateProductReqDto {
  @StringFieldOptional({ description: 'Product name', maxLength: 255 })
  name?: string;

  @UUIDFieldOptional({ description: 'Unit id (ĐVT)' })
  unitId?: string;

  @StringFieldOptional({ description: 'Product code', maxLength: 50 })
  code?: string;

  @UUIDFieldOptional({ description: 'Client id', nullable: true })
  clientId?: string | null;

  @UUIDFieldOptional({ description: 'Product group id', nullable: true })
  productGroupId?: string | null;

  @StringFieldOptional({ description: 'Image URL', nullable: true, maxLength: 500 })
  imageUrl?: string | null;

  @StringFieldOptional({ description: 'Revision', maxLength: 50 })
  revision?: string;

  @EnumFieldOptional(() => ProductStatus)
  status?: ProductStatus;

  @StringFieldOptional({ description: 'Note', nullable: true, maxLength: 1000 })
  note?: string | null;
}
