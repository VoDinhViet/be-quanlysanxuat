import { Exclude, Expose } from 'class-transformer';

import { FileField } from '../../files/dto/file.field';
import { FileResDto } from '../../files/dto/file.res.dto';
import { ProductStatus, ProductType } from '../../../database/schemas';
import {
  ClassField,
  ClassFieldOptional,
  DateField,
  EnumField,
  StringField,
  StringFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators';
import { ProductAttachmentResDto } from './product-attachment.res.dto';
import { ProductCreatorResDto } from './product-creator.res.dto';
import { ProductRefResDto } from './product-ref.res.dto';

@Exclude()
export class ProductResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField({ description: 'Product code' })
  code!: string;

  @Expose()
  @StringField({ description: 'Product name' })
  name!: string;

  @Expose()
  @EnumField(() => ProductType)
  type!: ProductType;

  @Expose()
  @FileField('imageFile', 'Image file')
  image!: FileResDto | null;

  @Expose()
  @EnumField(() => ProductStatus)
  status!: ProductStatus;

  @Expose()
  @StringFieldOptional({ nullable: true })
  note!: string | null;

  @Expose()
  @ClassFieldOptional(() => ProductRefResDto, { nullable: true })
  client!: ProductRefResDto | null;

  @Expose()
  @ClassFieldOptional(() => ProductRefResDto, { nullable: true })
  group!: ProductRefResDto | null;

  @Expose()
  @ClassField(() => ProductRefResDto)
  unit!: ProductRefResDto;

  @Expose()
  @ClassFieldOptional(() => ProductCreatorResDto, { nullable: true })
  creator!: ProductCreatorResDto | null;

  @Expose()
  @ClassFieldOptional(() => ProductAttachmentResDto, { each: true })
  attachments!: ProductAttachmentResDto[];

  @Expose()
  @ClassFieldOptional(() => ProductRefResDto, {
    nullable: true,
    description: 'Sản phẩm gốc được sao chép từ (nếu là bản sao)',
  })
  source!: ProductRefResDto | null;

  @Expose()
  @DateField()
  createdAt!: Date;

  @Expose()
  @DateField()
  updatedAt!: Date;
}
