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
import { UserRefResDto } from '../../users/dto/user-ref.res.dto';
import { ProductRefResDto } from './product-ref.res.dto';

@Exclude()
export class ProductResDto {
  @Expose()
  @UUIDField()
  id!: string;

  @Expose()
  @StringField({ description: 'Mã sản phẩm' })
  code!: string;

  @Expose()
  @StringField({ description: 'Tên sản phẩm' })
  name!: string;

  @Expose()
  @EnumField(() => ProductType)
  type!: ProductType;

  @Expose()
  @EnumField(() => ProductStatus)
  status!: ProductStatus;

  @Expose()
  @StringFieldOptional({ nullable: true })
  note!: string | null;

  @Expose()
  @DateField()
  createdAt!: Date;

  @Expose()
  @DateField()
  updatedAt!: Date;

  @Expose()
  @FileField('imageFile', 'Image file')
  image!: FileResDto | null;

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
  @ClassFieldOptional(() => UserRefResDto, { nullable: true })
  creator!: UserRefResDto | null;
}
