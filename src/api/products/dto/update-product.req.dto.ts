import { ProductStatus, ProductType } from '../../../database/schemas';
import {
  EnumFieldOptional,
  StringFieldOptional,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

/**
 * No `revision` field — versioning is done by cloning the whole product via
 * `POST /products/:id/copy`, not by editing a version-history sub-resource.
 */
export class UpdateProductReqDto {
  @StringFieldOptional({ description: 'Product name', maxLength: 255 })
  name?: string;

  @UUIDFieldOptional({ description: 'Unit id (ĐVT)' })
  unitId?: string;

  @StringFieldOptional({ description: 'Product code', maxLength: 50 })
  code?: string;

  @EnumFieldOptional(() => ProductType)
  type?: ProductType;

  @UUIDFieldOptional({ description: 'Client id', nullable: true })
  clientId?: string | null;

  @UUIDFieldOptional({ description: 'Product group id', nullable: true })
  productGroupId?: string | null;

  @UUIDFieldOptional({
    description: 'Image file id (from POST /files?type=PRODUCT_IMAGE)',
    nullable: true,
  })
  imageFileId?: string | null;

  @UUIDFieldOptional({
    each: true,
    description: 'Attachment file ids (from POST /files?type=PRODUCT_DOCUMENT)',
  })
  attachmentFileIds?: string[];

  @EnumFieldOptional(() => ProductStatus)
  status?: ProductStatus;

  @StringFieldOptional({ description: 'Note', nullable: true, maxLength: 1000 })
  note?: string | null;
}
