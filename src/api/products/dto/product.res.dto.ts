import { Exclude, Expose, Transform } from 'class-transformer';

import { FileResDto } from '../../files/dto/file.res.dto';
import { toFileResDto } from '../../files/dto/to-file-res.dto.util';
import { ProductStatus } from '../../../database/schemas';
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
  // `toClassOnly`: the global ClassSerializerInterceptor serialises this DTO a second
  // time, and on that pass `obj` is the DTO instance — which has no `imageFile` — so an
  // unrestricted transform would overwrite the resolved file with null.
  @Transform(({ obj }: { obj: { imageFile?: unknown } }) => toFileResDto(obj.imageFile), {
    toClassOnly: true,
  })
  @ClassFieldOptional(() => FileResDto, { nullable: true, description: 'Image file' })
  image!: FileResDto | null;

  @Expose()
  @StringField({ description: 'Revision, e.g. R01' })
  revision!: string;

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
  @DateField()
  createdAt!: Date;

  @Expose()
  @DateField()
  updatedAt!: Date;
}
