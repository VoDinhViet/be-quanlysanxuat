import { ProductStatus } from '../../../database/schemas';
import {
  EnumFieldOptional,
  StringField,
  StringFieldOptional,
  UUIDField,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators';

export class CreateProductReqDto {
  @StringField({ description: 'Product name', maxLength: 255 })
  name!: string;

  @UUIDField({ description: 'Unit id (ĐVT)' })
  unitId!: string;

  @StringFieldOptional({ description: 'Product code; auto-generated if omitted', maxLength: 50 })
  code?: string;

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

  @StringFieldOptional({ description: 'Revision, defaults to R01', maxLength: 50 })
  revision?: string;

  @EnumFieldOptional(() => ProductStatus)
  status?: ProductStatus;

  @StringFieldOptional({ description: 'Note', nullable: true, maxLength: 1000 })
  note?: string | null;
}
